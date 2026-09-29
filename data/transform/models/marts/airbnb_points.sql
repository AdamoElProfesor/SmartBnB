-- Amenities score of each listing: the sum of the weights of its amenity categories
select
    a.listing_id as airbnb_id,
    sum(p.point) as total_points
from {{ ref('stg_amenities') }} as a
join {{ source('app', 'amenity_points') }} as p on p.amenity_id = a.amenity_id
group by a.listing_id
