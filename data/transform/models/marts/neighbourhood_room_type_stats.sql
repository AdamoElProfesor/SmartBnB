-- Price of the current market per neighbourhood and room type: one price per
-- active listing (its latest), among prices seen in the last stats_window_months
with prices as (
    select * from {{ ref('current_prices') }}
)

select
    l.neighbourhood,
    l.room_type,
    avg(p.price) as avg_price,
    percentile_cont(0.5) within group (order by p.price) as median_price,
    count(*) as count_airbnb
from prices as p
join {{ ref('int_active_listings') }} as l on l.listing_id = p.listing_id
where p.price_date >= (select max(price_date) from prices)
                      - make_interval(months => {{ var('stats_window_months') }})
  and l.neighbourhood is not null
  and l.room_type is not null
group by 1, 2
