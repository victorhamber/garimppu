import sys

from sqlalchemy import create_engine, text

e = create_engine("postgresql+psycopg://garimppu:garimppu@localhost:5433/garimppu")
with e.connect() as c:
    for row in c.execute(text(sys.argv[1])):
        print(tuple(row))
