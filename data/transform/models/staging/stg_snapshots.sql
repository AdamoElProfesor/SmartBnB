-- One row per listing per scrape, with the price validity rule applied:
-- a scrape whose median price is below min_plausible_price shipped a broken
-- price column, so none of its prices is used, and any single price below
-- it is a parsing error.
with snapshots as (
    select * from {{ source('raw', 'airbnb_snapshots') }}
),

scrape_medians as (
    select
        scrape_id,
        percentile_cont(0.5) within group (order by price) as median_price
    from snapshots
    group by scrape_id
)

select
    s.listing_id,
    s.scrape_id,
    s.last_scraped,
    case
        when m.median_price < {{ var('min_plausible_price') }} then null
        when s.price < {{ var('min_plausible_price') }} then null
        else s.price
    end as price,
    s.minimum_nights,
    s.number_of_reviews,
    s.number_of_reviews_ltm,
    s.review_scores_rating,
    s.review_scores_accuracy,
    s.review_scores_cleanliness,
    s.review_scores_checkin,
    s.review_scores_communication,
    s.review_scores_location,
    s.review_scores_value,
    s.reviews_per_month
from snapshots as s
join scrape_medians as m on m.scrape_id = s.scrape_id
