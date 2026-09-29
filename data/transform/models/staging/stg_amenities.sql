select
    airbnb_id as listing_id,
    amenity_id
from {{ source('raw', 'airbnb_amenities') }}
