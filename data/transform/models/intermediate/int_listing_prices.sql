-- Every plausible nightly price of a listing, from the three price
-- definitions: the Inside Airbnb scrapes and the two passes of the price
-- scraper. A price outside the plausible range is left out, so the listing
-- keeps its previous one.
select
    listing_id,
    price,
    last_scraped as price_date,
    'insideairbnb' as source
from {{ ref('stg_snapshots') }}
where price between {{ var('min_nightly_price') }} and {{ var('max_nightly_price') }}

union all

select
    listing_id,
    price,
    price_date,
    'scrape_' || method as source
from {{ ref('stg_price_observations') }}
where price between {{ var('min_nightly_price') }} and {{ var('max_nightly_price') }}
