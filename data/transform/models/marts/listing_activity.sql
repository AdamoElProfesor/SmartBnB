-- Lifetime of each listing on Airbnb: when it was first and last seen, and
-- whether it is still active, i.e. in one of the last active_scrapes
-- scrapes. The one definition of "active" for the score, the map, the Top 10
-- and every statistic of the current market.
with scrapes as (
    -- 1 = the latest scrape (Inside Airbnb scrape ids grow with time)
    select scrape_id, dense_rank() over (order by scrape_id desc) as recency
    from (select distinct scrape_id from {{ ref('stg_snapshots') }}) as s
)

select
    s.listing_id,
    min(s.last_scraped) as first_seen,
    max(s.last_scraped) as last_seen,
    max(s.scrape_id) as last_scrape_id,
    count(*) as scrapes_seen,
    min(r.recency) <= {{ var('active_scrapes') }} as is_active
from {{ ref('stg_snapshots') }} as s
join scrapes as r on r.scrape_id = s.scrape_id
group by s.listing_id
