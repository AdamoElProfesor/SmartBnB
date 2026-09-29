-- Per neighbourhood, over the scrapes of the last stats_window_months: mean
-- of each snapshot's average review score, and mean reviews_per_month (the
-- baseline of the score's reviews part)
with snapshots as (
    select * from {{ ref('stg_snapshots') }}
)

select
    l.neighbourhood,
    avg(r.row_avg) as avg_reviews,
    avg(s.reviews_per_month) as avg_reviews_per_month
from snapshots as s
join {{ ref('stg_listings') }} as l on l.listing_id = s.listing_id
cross join lateral (
    select avg(x) as row_avg
    from unnest(array[
        s.review_scores_rating, s.review_scores_accuracy,
        s.review_scores_cleanliness, s.review_scores_checkin,
        s.review_scores_communication, s.review_scores_location,
        s.review_scores_value
    ]) as x
) as r
where s.last_scraped >= (select max(last_scraped) from snapshots)
                        - make_interval(months => {{ var('stats_window_months') }})
  and l.neighbourhood is not null
group by 1
