# JobAlertPro — Premium Job Alert Website

A production-oriented starter website for a ₹499/month job-alert service.

## Included
- Premium landing page
- Full name, target job title, WhatsApp number
- Private resume upload (PDF/DOC/DOCX, max 5 MB)
- No online payment: you contact each customer on WhatsApp to collect payment, then mark them "Paid" in /admin
- Customer details and CVs stored in MongoDB Atlas (free tier; CVs via GridFS)
- Password-protected /admin page to view customers and download CVs
- WhatsApp contact link for support

## Setup

1. Install Node.js 18+.
2. Run:
   npm install
3. Copy `.env.example` to `.env`.
4. Set the monthly price shown on the site (whole rupees):
   PRICE_INR=499
5. Set up MongoDB Atlas (free) and the admin password — see below.
6. Start:
   npm start
7. Open http://localhost:3000

## MongoDB Atlas setup
1. In Atlas → your cluster → **Connect** → **Drivers** → copy the connection string.
2. Replace `<db_password>` in it with your database user's password, then put it in `.env`:
   MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   If the password contains special characters (@ : / ? # %), URL-encode them.
3. Set an admin password in `.env`:
   ADMIN_PASSWORD=use-a-long-random-password
4. **Network Access:** Atlas only allows the IP addresses on its Access List. Your home IP works for local testing;
   when you deploy (Render, Railway, VPS…), add your host's outgoing IP, or `0.0.0.0/0` if the host has no fixed IP
   (then your strong database password is the only protection, so keep it secret).

The `jobalert` database is created automatically on the first signup:
- `applications` collection: name, WhatsApp, job title, experience, location, payment status (pending/paid), date, CV reference
- `resumes.files` / `resumes.chunks`: the CV files (GridFS)

## Viewing customers
- Open http://localhost:3000/admin (or your live domain + `/admin`). The browser asks for a login:
  any username, and `ADMIN_PASSWORD` as the password. You'll see every customer with WhatsApp and CV download links, and a "Mark paid" button for after they've paid you.
- Or in Atlas → Data Explorer → `jobalert` → `applications`.

Free Atlas clusters have 512 MB total — enough for roughly 1,000–2,500 CVs.

## Production recommendations
- Use HTTPS.
- Keep `.env` out of public/static hosting and version control.
- Add privacy policy, terms, refund/cancellation policy and consent logging.
- Add WhatsApp Business API/provider integration to automate daily job alerts.
- Do not promise jobs, interviews, referrals, or employment.
