-- "Price trends" on the site: per district, how the nightly price of the
-- same listings changed between two scrapes that report prices the same way.
--
-- Inside Airbnb changed how it reports prices between the November 2025 and
-- March 2026 scrapes (issue #17): the same listings went up by a median 34%
-- in one step and almost none kept its price, while from one month to the
-- next the median listing does not change and 20 to 70% of the prices stay
-- exactly the same. Comparing across that step measured the new definition,
-- not the market, and showed every district at +30% to +65%. So:
-- 1. The price series breaks at a scrape where the median price change of
--    the listings priced in it and in the previous priced scrape is above
--    price_break_ratio (or below its inverse).
-- 2. The trend compares the first priced scrape of the current series in the
--    last trend_window_months with the latest priced scrape.
-- 3. Only the listings priced in both scrapes count, and the trend is the
--    median of their own price changes: listings that join or leave do not
--    move it, and neither do a few extreme prices.
-- Districts with fewer than min_trend_listings such listings are left out,
-- and there is no row when the current series has a single priced scrape.
with prices as (
    select listing_id, scrape_id, last_scraped, price
    from {{ ref('stg_snapshots') }}
    where price is not null
),

priced_scrapes as (
    select
        scrape_id,
        min(last_scraped) as scraped_on,
        lag(scrape_id) over (order by scrape_id) as previous_scrape_id
    from prices
    group by scrape_id
),

-- Median price change of the same listings from one priced scrape to the next
steps as (
    select
        s.scrape_id,
        percentile_cont(0.5) within group (order by cur.price / prev.price) as median_change
    from priced_scrapes as s
    join prices as prev on prev.scrape_id = s.previous_scrape_id
    join prices as cur on cur.scrape_id = s.scrape_id and cur.listing_id = prev.listing_id
    group by s.scrape_id
),

-- First scrape of the current series: the latest break, else the first priced scrape
series as (
    select coalesce(
        (select max(scrape_id) from steps
          where median_change > {{ var('price_break_ratio') }}
             or median_change < 1.0 / {{ var('price_break_ratio') }}),
        (select min(scrape_id) from priced_scrapes)
    ) as first_scrape_id
),

bounds as (
    select
        (select min(p.scrape_id)
           from priced_scrapes as p
          where p.scrape_id >= (select first_scrape_id from series)
            and p.scraped_on >= (select max(scraped_on) from priced_scrapes)
                                - make_interval(months => {{ var('trend_window_months') }})) as start_scrape_id,
        (select max(scrape_id) from priced_scrapes) as end_scrape_id
),

changes as (
    select
        coalesce(l.neighbourhood_group, 'Unknown') as region,
        cur.price / prev.price as change
    from bounds as b
    join prices as prev on prev.scrape_id = b.start_scrape_id
    join prices as cur on cur.scrape_id = b.end_scrape_id and cur.listing_id = prev.listing_id
    join {{ ref('stg_listings') }} as l on l.listing_id = prev.listing_id
    where b.start_scrape_id < b.end_scrape_id
),

by_region as (
    select
        region,
        count(*) as n_listings,
        percentile_cont(0.5) within group (order by change) as median_change
    from changes
    group by region
)

select
    r.region,
    p_start.scraped_on as start_date,
    p_end.scraped_on as end_date,
    r.n_listings,
    (r.median_change - 1) * 100.0 as pct
from by_region as r
cross join bounds as b
join priced_scrapes as p_start on p_start.scrape_id = b.start_scrape_id
join priced_scrapes as p_end on p_end.scrape_id = b.end_scrape_id
where r.n_listings >= {{ var('min_trend_listings') }}
