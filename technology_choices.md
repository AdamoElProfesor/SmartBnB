# SmartBnB – Technology Choices

This document explains the tech stack selected for the SmartBnB project

---

## 1. <b>Dataset</b>

Choice: InsideAirbnb.com

<b>Reason</b>:

- Provides free, public, and structured Airbnb data for multiple cities.

- Delivered in CSV format, which is simple to process and load into a 
database.

- Covers listings, prices, availability, and reviews are directly aligned 
with SmartBnB’s needs.

- Updated monthly, which makes it ideal for implementing a scheduled ETL 
pipeline.

<b>Alternatives considered</b>:

Other public datasets were outdated. InsideAirbnb’s regular updates and 
structured format made it the most suitable option.


## 2. <b>Database</b>

Choice: Supabase (PostgreSQL)

<b>Reason</b>:

- Cloud-hosted

- PostgreSQL supports relational queries, fitting our structured Airbnb 
dataset.

- Free tier and easy integration with Node.js backend.

<b>Alternatives and why not chosen</b>:

- Snowflake: Overkill for our small dataset (~100,000 rows) and paid 
service adds unnecessary cost.

- Local database: Would require our laptop to be running 24/24, which is 
not possible.

- Cloud platforms (AWS, Azure, GCP): Too complex to set up for an MVP, 
Supabase offers a much simpler 
solution.

## 3. <b>Front-end</b>

Choice: Vue.js

<b>Reason</b>:

- Lightweight and beginner-friendly, well suited for a one-page 
application.

- Direct support for visualization libraries (e.g., heatmaps via 
Leaflet with free OpenStreetMap tiles, no API key).

<b>Alternatives and why not chosen</b>:

- React/Next.js: Very popular, but slightly more complex for a small MVP. 
Vue was chosen for its simplicity.

## 4. <b>Backend</b>


Choice: Node.js with Express.js

<b>Reason</b>:

- Simple to set up, fast to develop, and integrates naturally with the 
Vue.js frontend.

- REST API endpoints can easily connect frontend to Supabase.

- Fully compatible with the OpenAI API.

<b>Alternatives and why not chosen</b>:

- Python (FastAPI/Flask): Excellent for ML workflows, but using Python 
only for the backend would split 
the tech stack unnecessarily. Staying in JavaScript is more efficient for 
this project.


## 5. <b>Deployement</b>

Choice: Render

<b>Reason</b>:

- Supports unified deployment (frontend + backend in one service).

- Free tier suitable for small apps.

- Handles build, hosting, and scaling automatically with minimal setup.


<b>Alternatives and why not chosen</b>:

- Heroku: Reliable but has slower "cold start" times on free tier.

- Railway: Strong option but designed more for separate frontend/backend 
deployments, whereas Render 
simplifies unified deployment.


## 6. <b>Automated ETL Pipeline</b>

Choice: Astronomer (Managed Airflow)

<b>Reason</b>

- We can still use Airflow DAGs, but without worrying about infrastructure 
management.

- Airflow is a key technology in modern data engineering, and gaining 
hands-on experience with it adds 
strong value to our portfolio.

- Perfect for scheduling the monthly ingestion of Airbnb data

<b>Alternatives and why not chosen</b>:

- Self-hosted Airflow: Would require significant infrastructure 
management, and laptop available 24/24.

## 7. <b>AI for Reviews</b>

Choice: OpenAI API

<b>Reason</b>:

- Team already has experience using OpenAI’s API.

- Simple text models are sufficient for analyzing Airbnb reviews.

- Paid account already available, lowering adoption cost.

<b>Alternatives and why not chosen</b>:

- OpenAI provides everything we need at this stage.

<b>Update (2026)</b>: the analysis now runs on open-weights models
(`gpt-oss-20b` by default) through Cloudflare Workers AI, which has a free
daily allowance. The backend still uses the OpenAI SDK against an
OpenAI-compatible endpoint, so switching back to OpenAI only means changing
environment variables (see `cloudflare/README.md`).



## 8. <b>Containerization</b>

Choice: Docker

<b>Reason</b>:

- Standard tool in modern development and deployment workflows.

- Team has already experience with it.

