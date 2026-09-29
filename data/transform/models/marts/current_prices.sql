-- Latest plausible price of each listing, from whichever source saw it last,
-- if seen in the price_window_months before the newest price
with prices as (
    select * from {{ ref('int_listing_prices') }}
)

select distinct on (p.listing_id)
    p.listing_id,
    p.price,
    p.price_date
from prices as p
join {{ ref('stg_listings') }} as l on l.listing_id = p.listing_id
where p.price_date >= (select max(price_date) from prices)
                      - make_interval(months => {{ var('price_window_months') }})
order by p.listing_id, p.price_date desc
