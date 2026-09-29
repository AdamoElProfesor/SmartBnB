-- Prices the scraper found (status ok), as a nightly price and a date
select
    listing_id,
    nightly_price::double precision as price,
    observed_at::date as price_date
from {{ source('app', 'price_observations') }}
where status = 'ok'
