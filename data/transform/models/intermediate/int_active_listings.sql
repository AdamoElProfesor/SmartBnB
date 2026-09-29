-- Listings still on Airbnb, with their static data: the population of every
-- statistic of the current market
select l.*
from {{ ref('stg_listings') }} as l
join {{ ref('listing_activity') }} as a on a.listing_id = l.listing_id
where a.is_active
