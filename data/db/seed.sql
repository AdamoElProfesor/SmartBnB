-- Reference data: the 10 amenity categories and their weight in the
-- SmartBnB amenities score (values from the original Supabase project).

INSERT INTO public.amenity_references (id, name) VALUES
  (1,  'WIFI'),
  (2,  'KITCHEN'),
  (3,  'HEATING'),
  (4,  'AC'),
  (5,  'PARKING'),
  (6,  'WASHER'),
  (7,  'DRYER'),
  (8,  'WORKSPACE'),
  (9,  'ENTRANCE'),
  (10, 'HOTTUB')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.amenity_points (amenity_id, point) VALUES
  (1,  10),
  (2,  9),
  (3,  8),
  (4,  7),
  (5,  6),
  (6,  5),
  (7,  4),
  (8,  3),
  (9,  2),
  (10, 1)
ON CONFLICT (amenity_id) DO UPDATE SET point = EXCLUDED.point;
