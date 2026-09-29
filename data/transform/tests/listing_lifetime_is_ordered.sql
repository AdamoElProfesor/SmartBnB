-- A listing is first seen before (or on the day) it is last seen
select listing_id, first_seen, last_seen
from {{ ref('listing_activity') }}
where first_seen > last_seen
