-- "Prices this year" on the site: per region, the median price of the first
-- priced scrape of the trend_window_months before the latest priced scrape,
-- against the latest one. No row when a single scrape has prices.
with priced as (
    select scrape_id, min(last_scraped) as scraped_on
    from {{ ref('stg_snapshots') }}
    where price is not null
    group by scrape_id
),

bounds as (
    select
        (select min(scrape_id) from priced
          where scraped_on >= (select max(scraped_on) from priced)
                              - make_interval(months => {{ var('trend_window_months') }})) as m_min,
        (select max(scrape_id) from priced) as m_max
),

medians as (
    select
        coalesce(l.neighbourhood_group, 'Unknown') as region,
        s.scrape_id,
        -- double precision: some databases store price as real, and the
        -- percentage must not be computed at real precision
        percentile_disc(0.5) within group (order by s.price)::double precision as median
    from {{ ref('stg_snapshots') }} as s
    join {{ ref('stg_listings') }} as l on l.listing_id = s.listing_id
    where s.price is not null
      and s.scrape_id in (select m_min from bounds union select m_max from bounds)
    group by 1, 2
)

select
    a_min.region,
    p_min.scraped_on as start_date,
    p_max.scraped_on as end_date,
    a_min.median as start_median,
    a_max.median as end_median,
    case
        when a_min.median > 0
            then (a_max.median - a_min.median) / a_min.median * 100.0
    end as pct
from bounds as b
join medians as a_min on a_min.scrape_id = b.m_min
join medians as a_max on a_max.scrape_id = b.m_max and a_max.region = a_min.region
join priced as p_min on p_min.scrape_id = b.m_min
join priced as p_max on p_max.scrape_id = b.m_max
where b.m_min < b.m_max
