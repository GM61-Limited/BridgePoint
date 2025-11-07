FROM postgres:17


# Copy your SQL init script into the correct Postgres init directory
# Any .sql file in /docker-entrypoint-initdb.d/ runs automatically on first startup
COPY ./init/init.sql /docker-entrypoint-initdb.d/

# Note:
# To persist data, mount a volume to /var/lib/postgresql/data
# Example: docker run -v pgdata:/var/lib/postgresql/data ...