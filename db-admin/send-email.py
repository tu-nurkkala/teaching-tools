import json
import smtplib
import sys
from email.message import EmailMessage
from string import Template

body_template = Template("""
Hi, $first_name --

I've set up a database for you to use in COS 343.

   hostname: faraday.cse.taylor.edu
   username: $username
   password: $password
   database: $db_name

thanks,
dr. nurk.
""")

with open(sys.argv[1]) as jsonfile:
    students = json.load(jsonfile)
    for student in students:
        body = body_template.substitute(first_name=student["first_name"],
                                        username=student["pg_username"],
                                        password=student["pg_password"],
                                        db_name=student["pg_db_name"])

        message = EmailMessage()
        message.set_content(body)
        message['Subject'] = "Database account for COS 343"
        message["From"] = "Tom Nurkkala <tnurkkala@cse.taylor.edu>"
        message["To"] = student["email"]

        print(f"username: {student['pg_username']}, password: {student['pg_password']}, database: {student['pg_db_name']}")

        with smtplib.SMTP(host="smtp.cse.taylor.edu", port=587) as server:
            server.send_message(message)
