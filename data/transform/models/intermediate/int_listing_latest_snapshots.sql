-- Each listing's latest snapshot among the scrapes of the last
-- stats_window_months. One row per listing, so a listing counts once in a
-- neighbourhood baseline however many scrapes it appears in.
with snapshots as (
    select * from {{ ref('stg_snapshots') }}
)

select distinct on (listing_id)
    listing_id,
    scrape_id,
    last_scraped,
    number_of_reviews,
    reviews_per_month,
    review_scores_rating
from snapshots
where last_scraped >= (select max(last_scraped) from snapshots)
                      - make_interval(months => {{ var('stats_window_months') }})
order by listing_id, last_scraped desc, scrape_id desc
