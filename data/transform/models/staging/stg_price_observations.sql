-- Prices the scraper found (status ok), as a nightly price and a date.
-- method: 'search' (search results: a Friday, 2 nights, about 4 weeks ahead)
-- or 'listing' (listing page: next free stay of the minimum length)
select
    listing_id,
    nightly_price::double precision as price,
    observed_at::date as price_date,
    method
from {{ source('app', 'price_observations') }}
where status = 'ok'
