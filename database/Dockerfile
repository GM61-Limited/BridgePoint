FROM postgres:latest

# Environment variables for PostgreSQL setup
ENV POSTGRES_DB=bridgepointbd
ENV POSTGRES_USER=gm61admin
ENV POSTGRES_PASSWORD=camioninsta

# Note:
# To persist data, mount a volume to /var/lib/postgresql/data
# Example: docker run -v pgdata:/var/lib/postgresql/data ...
#
# To load initialization SQL scripts, place them in a directory and mount it to /docker-entrypoint-initdb.d/
# Scripts in this directory will be executed during container startup to set up the schema.
