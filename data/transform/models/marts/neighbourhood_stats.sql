-- Review baselines per neighbourhood, one row per listing (its latest
-- snapshot of the stats window), with the same metrics as the listing side
-- of the score:
--   avg_rating             the overall rating (review_scores_rating), over
--                          the listings that have one
--   avg_reviews_per_month  reviews_per_month, where a listing with no review
--                          counts as 0, as it does on the listing side
with listings as (
    select
        s.*,
        l.neighbourhood,
        -- Inside Airbnb leaves reviews_per_month empty exactly when a listing
        -- has no review; any other empty value stays unknown
        case when s.number_of_reviews = 0 then 0 else s.reviews_per_month end as reviews_per_month_filled
    from {{ ref('int_listing_latest_snapshots') }} as s
    join {{ ref('stg_listings') }} as l on l.listing_id = s.listing_id
    where l.neighbourhood is not null
)

-- Means are summed as numeric: a floating point sum depends on the order of
-- the rows, which can change between runs, and a run must be reproducible
select
    neighbourhood,
    avg(review_scores_rating::numeric)::double precision as avg_rating,
    -- Former name of avg_rating, kept until the backend reads avg_rating
    -- everywhere (expand / contract), then dropped
    avg(review_scores_rating::numeric)::double precision as avg_reviews,
    avg(reviews_per_month_filled::numeric)::double precision as avg_reviews_per_month,
    count(*) as n_listings,
    count(review_scores_rating) as n_rated_listings
from listings
group by neighbourhood
