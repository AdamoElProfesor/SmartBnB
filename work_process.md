# Work process description

## Methodology

We adopted a agile approach inspired by Scrum/Kanban.  
The 3 weeks of the project are organized into sprints :

- **Week 1**: project definition, mockups, technical choices, pipelines, environment setup
- **Week 2**: Data ingestion and transformation, and start of implementation of the main feature (user Airbnb evaluation) and testing that
- **Week 3**: implementation of additional features (statistics, interactive map), testing

Every day, we hold a meeting on Teams to discuss what we did the previous day, the objectives for the day, the team's location for the day, and any issues encountered

---

## 2. Team Management
We decided to split responsibilities while keeping flexibility:  

- **Data engineer**: dataset cleaning and preparation (ETL, monthly updates)
- **Backend developer**: business logic (API, aggregation of statistics)
- **Frontend developer**: landing page, visualizations (graphs, interactive map, landing page) 

Important decisions are made collaboratively during team discussions WhatsApp

---

## 3. Source Code Management
We use GitHub with a Git Flow workflow :

- `main` branch: always stable and production-ready 
- `develop` branch: integration of new features 
- `feature/...` branches: individual development of each feature.  

Every new feature is merged into `develop` through a pull request and must be reviewed by at leat one team member

---

## 4. Development Tools
- **Issue tracking**: GitHub Projects (Kanban)
- **Communication**: WhatsApp and Teams
- **CI/CD**: GitHub pipelines for :
  - Code quality check + running tests automatically on each pull request in the develop and main branches
  - Code quality check, running tests automatically, create release, pushing into GHCR and deploying our application automatically into Render

---

## 5. Quality Assurance & Testing
We plan different levels of testing :

- **Unit tests**: core logic (logic of each endpoint, ...)
- **Integration tests**: interaction between backend and dataset
- **End-to-end tests**: main user flows (e.g submitting an Airbnb link → getting a score)  

---

## 6. Deployment & Delivery
- Each new feature starts with the creation of a GitHub issue assigned to a team member
- The developer creates a dedicated feature branch (feature/...) from develop to implement the feature
- Once the implementation is done, the developer pushes his changes into the branch and opens a pull request to merge into develop
- The CI/CD pipeline is automatically triggered on each pull request and includes :
  1. Code quality check
  2. Testing the code
- After validation and review, the feature is merged into develop, then into main when it is production-ready 
- A merge into main triggers the CI/CD pipeline (described above)

Deployment will be done on a cloud hosting service like Render to make the application accessible for everyone
