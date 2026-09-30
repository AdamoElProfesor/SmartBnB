<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo-dark.svg">
    <img src="docs/brand/logo.svg" alt="SmartBnB" width="300">
  </picture>
</h1>

**Is this Airbnb a good deal?** Paste an Airbnb listing from canton Vaud,
Switzerland, and SmartBnB compares it with similar stays nearby: price, review
activity, amenities and host status, summed up in a score out of 100.

**Live at [smartbnb.ch](https://www.smartbnb.ch)**

[![Watch the SmartBnB demo (1 min 21)](docs/media/demo-thumbnail.jpg)](https://www.smartbnb.ch/media/smartbnb-demo.mp4)

## What it does

- **Check a listing.** Paste a link like `https://www.airbnb.ch/rooms/53584592`
  (or a share link from the Airbnb app)
  and get a SmartScore out of 100, the nightly price against the median of the
  same room type in the same neighbourhood, the rating, review activity and
  key amenities.
- **Read a short analysis.** An open-weights language model turns those
  numbers into strengths and points to watch out for.
- **Explore the region.** A price map of the active listings, Top 10 lists
  (best rated, cheapest, most reviewed this year) and price trends by district.

## How the score works

Each listing gets a score out of 100, from five parts:

| Part | Weight | Better when |
|---|---|---|
| Price | 45% | the nightly price is below the median of similar stays |
| Review activity | 15% | the listing gets more reviews per month than the area |
| Guest rating | 15% | the rating is high, weighed by the number of reviews (4.5 or less gives no point) |
| Key amenities | 15% | it has the amenities guests look for most |
| Superhost | 10% | the host is a Superhost |

Similar stays are those of the same room type and capacity (1-2, 3-4, 5-6,
7+ guests), in the same neighbourhood when it has at least 5 of them, else
in the district, else in the whole canton. The rating is a Bayesian average:
a listing with few reviews is pulled towards the canton's mean rating, so a
5.0 from 2 guests is not worth more than a 4.9 from 200.

The code is in
[`smartbnb/backend/src/utils/score.utils.js`](smartbnb/backend/src/utils/score.utils.js).

## Architecture

```mermaid
flowchart LR
  user[Browser] --> relay[Cloudflare Worker<br/>smartbnb.ch]
  relay --> app[Render: Express API<br/>+ Vue app]
  app --> db[(Supabase Postgres)]
  app --> ai[Cloudflare Worker<br/>Workers AI, gpt-oss-20b]
  pipeline[Data pipeline<br/>load, dbt, audit, publish] --> db
  insideairbnb[Inside Airbnb snapshots] --> pipeline
```

| Folder | Content |
|---|---|
| [`smartbnb/frontend`](smartbnb/frontend) | Vue 3 + Vite app, Leaflet maps on OpenStreetMap |
| [`smartbnb/backend`](smartbnb/backend) | Node.js + Express API, also serves the built app |
| [`data`](data) | Data pipeline: loader ([`data/db`](data/db)), dbt transformations and tests ([`data/transform`](data/transform)), price collection |
| [`cloudflare`](cloudflare) | Workers: domain relay, AI endpoint, keep-alive |
| [`docs`](docs) | Guides for running, deploying and operating the app, plus the logo files ([`docs/brand`](docs/brand)) |

## Run it locally

You need Node.js 22 and a Postgres database loaded with the data (see
[data/db/README.md](data/db/README.md)).

```bash
cp smartbnb/backend/.env.example smartbnb/backend/.env   # set DATABASE_URL

cd smartbnb/frontend && npm ci && npm run build
cd ../backend && npm ci && npm start                       # http://localhost:3000
```

The AI analysis is optional: without an AI key the score is shown alone. Tests
run with `npm test` in `smartbnb/backend` and need no database;
`npm run test:integration` runs the SQL queries against a throwaway Postgres.
Docker and production setup: [docs/deployment.md](docs/deployment.md).

## Data

Listing data comes from [Inside Airbnb](https://insideairbnb.com/) and is
licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The
[Inside Airbnb data policies](https://insideairbnb.com/data-policies/) ask
not to republish the data, so this repository holds none of it: every
monthly snapshot since July 2024 is archived in a private repository, so the
database can be rebuilt without depending on Inside Airbnb keeping its
archives online. New snapshots are downloaded with
`python data/db/pipeline.py --fetch`. Only the columns SmartBnB uses are
kept: no host names, host profiles or texts written by hosts.

From June to September 2026 the Inside Airbnb snapshots for Switzerland had a
broken price column; Inside Airbnb republished them with corrected prices on
2026-09-26 and they were reloaded. Current prices are also collected from
Airbnb once a month, see [data/prices](data/prices/README.md), and each result
uses the newest of the two. Each result shows the date its price was seen.

## Documentation

- [Running and deploying](docs/deployment.md)
- [API](docs/api.md)
- [CI and deployment](docs/ci.md)
- [Operations](docs/operations.md): keep-alive, uptime checks, alerts, backups
- [Data loading](data/db/README.md) and [Cloudflare Workers](cloudflare/README.md)

## Contributing

Issues and pull requests are welcome. Start with the
[`good first issue`](https://github.com/AdamoElProfesor/SmartBnB/labels/good%20first%20issue)
label and read [CONTRIBUTING.md](CONTRIBUTING.md). Security problems:
[SECURITY.md](SECURITY.md).

## Credits

SmartBnB started in 2025 as a student project at HEIG-VD by Adam Gruber
([@AdamoElProfesor](https://github.com/AdamoElProfesor)), Axel Pittet
([@Axwells](https://github.com/Axwells)) and
[@CestPolo](https://github.com/CestPolo). It is now maintained by Adam Gruber.

## License

The code is released under the [MIT License](LICENSE). The data keeps its own
license, see [Data](#data).
