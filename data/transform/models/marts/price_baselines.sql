-- The prices a listing's price is compared with (issue #19): one row per
-- active listing, the average and median current price of the similar
-- listings, i.e. the same room type and the same capacity band.
--
-- Capacity bands, not the price per guest: per guest, the entire homes for
-- 1 or 2 guests cost about 40% more than the larger ones (73 against about
-- 50 CHF in September 2026), so a price per guest would make every studio
-- look expensive, and one median for every size made large homes look
-- expensive.
--
-- The comparison is as local as the data allows: the neighbourhood when it
-- has at least min_price_comparables similar listings, else the district,
-- else the whole canton. Bands make the groups smaller, and a median of 2
-- listings says little. One price per active listing (its latest), among
-- prices seen in the last stats_window_months.
with listings as (
    select
        listing_id,
        neighbourhood,
        neighbourhood_group,
        room_type,
        {{ capacity_band('accommodates') }} as capacity_band
    from {{ ref('int_active_listings') }}
    where room_type is not null
),

prices as (
    select * from {{ ref('current_prices') }}
),

priced as (
    select l.*, p.price
    from prices as p
    join listings as l on l.listing_id = p.listing_id
    where p.price_date >= (select max(price_date) from prices)
                          - make_interval(months => {{ var('stats_window_months') }})
),

by_neighbourhood as (
    select
        neighbourhood as area, room_type, capacity_band,
        avg(price) as avg_price,
        percentile_cont(0.5) within group (order by price) as median_price,
        count(*) as n_listings
    from priced
    where neighbourhood is not null
    group by 1, 2, 3
),

by_district as (
    select
        neighbourhood_group as area, room_type, capacity_band,
        avg(price) as avg_price,
        percentile_cont(0.5) within group (order by price) as median_price,
        count(*) as n_listings
    from priced
    where neighbourhood_group is not null
    group by 1, 2, 3
),

by_canton as (
    select
        'Vaud' as area, room_type, capacity_band,
        avg(price) as avg_price,
        percentile_cont(0.5) within group (order by price) as median_price,
        count(*) as n_listings
    from priced
    group by 2, 3
),

-- Every level a listing can be compared at, the most local first
candidates as (
    select l.listing_id, 1 as rank, 'neighbourhood' as level, l.capacity_band,
           n.area, n.avg_price, n.median_price, n.n_listings
    from listings as l
    join by_neighbourhood as n
      on n.area = l.neighbourhood and n.room_type = l.room_type
     and n.capacity_band = l.capacity_band
    union all
    select l.listing_id, 2, 'district', l.capacity_band,
           d.area, d.avg_price, d.median_price, d.n_listings
    from listings as l
    join by_district as d
      on d.area = l.neighbourhood_group and d.room_type = l.room_type
     and d.capacity_band = l.capacity_band
    union all
    select l.listing_id, 3, 'canton', l.capacity_band,
           c.area, c.avg_price, c.median_price, c.n_listings
    from listings as l
    join by_canton as c
      on c.room_type = l.room_type and c.capacity_band = l.capacity_band
)

-- The most local level with enough listings; when none has enough, the
-- largest sample, the canton
select distinct on (listing_id)
    listing_id,
    level,
    area,
    capacity_band,
    avg_price,
    median_price,
    n_listings
from candidates
order by
    listing_id,
    (n_listings >= {{ var('min_price_comparables') }}) desc,
    case when n_listings >= {{ var('min_price_comparables') }} then rank else -rank end
