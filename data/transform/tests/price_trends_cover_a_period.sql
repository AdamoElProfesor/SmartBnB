-- A price trend compares an earlier scrape with a later one
select region, start_date, end_date
from {{ ref('price_trends') }}
where start_date >= end_date
