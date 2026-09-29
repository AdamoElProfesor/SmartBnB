-- The rating baseline rests on a subset of the listings of the reviews baseline
select neighbourhood, n_listings, n_rated_listings
from {{ ref('neighbourhood_stats') }}
where n_rated_listings > n_listings
