# SmartBnB

https://github.com/user-attachments/assets/e4382435-9a17-4f5f-85fb-becbc3c5df38

## Overview

Airbnb is a popular platform for finding temporary accommodations, whether 
for short-term stays or longer visits. With so many options available, it 
can be overwhelming to choose the right place, and sometimes, you might 
end up making a less than ideal deal.

This is where SmartBnB comes in. SmartBnB helps you make smarter decisions 
by allowing you to paste the URL of an Airbnb listing and instantly 
analyze whether it’s a good deal in the Vaud district.

Beyond evaluating individual listings, SmartBnB provides a clear 
visualization of the Vaud district. You can explore local price trends, 
compare 
rates across different areas, and see how prices fluctuate throughout the 
seasons.

SmartBnB is a web app designed to help you choose your Airbnb more 
intelligently, saving you both time and money.


## Objectives

1. <b>Data Storage</b>: Collect and store the InsideAirbnb.com dataset in 
a cloud database, designing structured tables that enable insightful 
analysis and smarter decision-making.

2. <b>Data Pipeline</b>: Load the InsideAirbnb.com snapshots into the 
database and refresh them with `data/db/load_data.py` (run manually, e.g. 
`python load_data.py --fetch`), without ever losing the snapshot history. 
See [data/db/README.md](data/db/README.md).
3. <b>Web App</b>:  Develop the SmartBnB web application, allowing users 
to paste an Airbnb listing URL and receive an evaluation of whether it 
represents a good deal.
4. <b>Visualizations</b>: Provide interactive visualizations of the Vaud 
district, including neighborhood comparisons and seasonal price trends.


## Fonctional Requirements

1. <b>User Input</b>

    Users can paste an Airbnb listing URL into the app.<br>
    The app responds with a smart answer explaining its decision.

2. <b>Visualization</b>

    Users can compare prices across neighborhoods.<br>
    Users can explore seasonal trends in pricing.
    Users can view price distributions on an interactive map.<br>

3. <b>Data Management</b>

    The system stores Airbnb listing data from InsideAirbnb.com in a cloud 
database.<br>
    Data is refreshed from the latest InsideAirbnb snapshot with 
`data/db/load_data.py --fetch`.<br>
    The system ensures data consistency and reliability.
4. <b>Web Application</b>

    The app provides a clean, intuitive web interface.
    The app is accessible across devices (desktop and mobile).


## Non Functional Requirements

1. <b>Performance </b>

    The app should return an analysis of a listing in under 3 seconds.<br>
    Visualizations should load smoothly.

2. <b>Availability & Reliability</b>

    The web app should have an uptime of at least 90%.<br>
    The data pipeline must recover automatically if an extraction fails.

3. <b>Data Quality</b>

    The system must ensure that the Airbnb data is up-to-date.<br>
    Data errors, duplicates, or missing values should be handled 
gracefully.

4. <b>Portability</b>

    The entire system (database, pipeline, and web app) must be able to 
run 100% locally


## Operations

Keep-alive, uptime checks, alerts, daily database backups (and how to restore
them) are described in [OPERATIONS.md](OPERATIONS.md).


## Data

Listing data comes from [Inside Airbnb](https://insideairbnb.com/) and is
licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
The snapshots in `data/*.csv.gz` are the Inside Airbnb
Vaud `listings.csv` files of 2024-2025, stored compressed.


## License

The code is released under the [MIT License](LICENSE). The data keeps its own
license, see [Data](#data).
