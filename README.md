# `clubbie`

Event management for your club made easy !

## Background

<a href="#installing"><small>cut the small talk and just let me install this</small></a>

We are a small CTF (Capture-the-flag) club established @[HEIG-VD](https://heig-vd.ch/) around 2020. Up until now, we were using Google Spreadsheets and Forms for enrollment, events organization/attendance checking. Needless to say it was becoming quite tedious to manage as we grew bigger and bigger (we are now around 50 members).

We began searching for existing solutions online, but couldn't find anything that suited our needs:

- Free and Open Source Software (FOSS) - we don't want to depend on any third party service
- Easy to deploy and maintain (we don't have a dedicated sysadmin)
- Simple and user-friendly interface for both members and organizers
- Features tailored for club management (event enrollment, attendance tracking, member management, etc.)

So we decided to build our own solution, and `clubbie` was born !

Find more about us on our [website](https://yctf.ch/).

## Installing

### Docker Compose (recommended)

1. Clone this repository:

    ```bash
    git clone https://github.com/Y-CTF/clubbie.git
    cd clubbie
    ```
2. Copy the example environment file and modify it to your needs:

    ```bash
    cp .env.example .env
    ```
3. Get it up and running:
    ```bash
    docker compose up -d
    ```

4. Access the interface at `http://localhost:3000`.

> [!WARNING]
> The first user to register will automatically become an admin.

### Manual installation

TODO