-- One row per listing, with the column names used downstream
select
    id as listing_id,
    name,
    neighbourhood_cleansed as neighbourhood,
    neighbourhood_group_cleansed as neighbourhood_group,
    room_type,
    accommodates,
    host_is_superhost,
    latitude,
    longitude
from {{ source('raw', 'airbnb_vaud') }}
