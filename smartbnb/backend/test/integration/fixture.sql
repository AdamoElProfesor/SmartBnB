-- Small, hand-written data set for the repository integration tests, loaded
-- after data/db/schema.sql and data/db/seed.sql (amenity categories 1-10).
--
-- Three scrapes: 1 = 2026-03-16, 2 = 2026-06-14, 3 = 2026-09-14.
--   101  Lausanne, entire home, active, priced 150, 400 reviews rated 4.9
--   102  Lausanne, entire home, active, no current price
--   103  Montreux, private room, active, priced 80, 30 nights minimum (long stay),
--        rated 5.0 by only 3 guests
--   104  Lausanne, left Airbnb after scrape 1 (inactive); it keeps a
--        current_prices row so the tests prove the queries filter on activity
--   105  Nyon, active, priced 60, no coordinates, never reviewed

INSERT INTO public.airbnb_vaud
  (id, listing_url, name, picture_url, host_is_superhost, neighbourhood_cleansed,
   neighbourhood_group_cleansed, latitude, longitude, room_type, accommodates)
VALUES
  (101, 'https://www.airbnb.com/rooms/101', 'Lake view flat', NULL, true,
   'Lausanne', 'Lausanne', 46.5197, 6.6323, 'Entire home/apt', 4),
  (102, 'https://www.airbnb.com/rooms/102', 'Old town studio', NULL, false,
   'Lausanne', 'Lausanne', 46.5220, 6.6350, 'Entire home/apt', 2),
  (103, 'https://www.airbnb.com/rooms/103', 'Room by the quay', NULL, false,
   'Montreux', 'Riviera-Pays-d''Enhaut', 46.4312, 6.9107, 'Private room', 1),
  (104, 'https://www.airbnb.com/rooms/104', 'Closed loft', NULL, false,
   'Lausanne', 'Lausanne', 46.5100, 6.6200, 'Entire home/apt', 3),
  (105, 'https://www.airbnb.com/rooms/105', 'Village chalet', NULL, false,
   'Nyon', 'Nyon', NULL, NULL, 'Entire home/apt', 6);

INSERT INTO public.airbnb_snapshots
  (listing_id, scrape_id, last_scraped, price, minimum_nights, number_of_reviews,
   number_of_reviews_ltm, review_scores_rating, reviews_per_month)
VALUES
  (101, 1, '2026-03-16', 140, 2, 380, 50, 4.8,  2.0),
  (101, 2, '2026-06-14', NULL, 2, 390, 55, 4.85, 2.1),
  (101, 3, '2026-09-14', 150, 2, 400, 60, 4.9,  2.2),
  (102, 2, '2026-06-14', NULL, 3, 18, 8, 4.4, 0.8),
  (102, 3, '2026-09-14', NULL, 3, 20, 2, 4.5, 0.9),
  (103, 3, '2026-09-14', 80, 30, 3, 3, 5.0, 0.3),
  (104, 1, '2026-03-16', 200, 1, 50, 20, 4.2, 1.0),
  (105, 3, '2026-09-14', 60, 1, 0, 0, NULL, NULL);

INSERT INTO public.listing_activity
  (listing_id, first_seen, last_seen, last_scrape_id, scrapes_seen, is_active)
VALUES
  (101, '2026-03-16', '2026-09-14', 3, 3, true),
  (102, '2026-06-14', '2026-09-14', 3, 2, true),
  (103, '2026-09-14', '2026-09-14', 3, 1, true),
  (104, '2026-03-16', '2026-03-16', 1, 1, false),
  (105, '2026-09-14', '2026-09-14', 3, 1, true);

INSERT INTO public.current_prices (listing_id, price, price_date, source) VALUES
  (101, 150, '2026-09-14', 'insideairbnb'),
  (103, 80,  '2026-09-14', 'insideairbnb'),
  (104, 200, '2026-03-16', 'insideairbnb'),
  (105, 60,  '2026-09-14', 'scrape_search');

-- 101: WIFI, KITCHEN, HEATING (10 + 9 + 8 points); 102: WIFI only
INSERT INTO public.airbnb_amenities (airbnb_id, amenity_id) VALUES
  (101, 1), (101, 2), (101, 3),
  (102, 1);

INSERT INTO public.airbnb_points (airbnb_id, total_points) VALUES
  (101, 27),
  (102, 10),
  (103, 0);

INSERT INTO public.neighbourhood_room_type_stats
  (neighbourhood, room_type, avg_price, median_price, count_airbnb)
VALUES
  ('Lausanne', 'Entire home/apt', 145.5, 140, 2),
  ('Lausanne', 'Private room',    70,    70,  5),
  ('Montreux', 'Private room',    82,    80,  1);

-- 101 is compared in its neighbourhood, 103 falls back to its district
INSERT INTO public.price_baselines
  (listing_id, level, area, capacity_band, avg_price, median_price, n_listings)
VALUES
  (101, 'neighbourhood', 'Lausanne', '3-4', 145.5, 140, 12),
  (103, 'district', 'Riviera-Pays-d''Enhaut', '1-2', 82, 80, 7);

INSERT INTO public.neighbourhood_stats
  (neighbourhood, avg_reviews_per_month, avg_rating, n_listings, n_rated_listings)
VALUES
  ('Lausanne', 1.55, 4.7, 3, 2),
  ('Montreux', 0.3,  5.0, 1, 1);

-- Lausanne and Nyon tie on pct: the query then orders them by region
INSERT INTO public.price_trends (region, start_date, end_date, n_listings, pct) VALUES
  ('Montreux', '2026-03-16', '2026-09-14', 41,  -2.0),
  ('Nyon',     '2026-03-16', '2026-09-14', 57,  4.5),
  ('Lausanne', '2026-03-16', '2026-09-14', 568, 4.5);
