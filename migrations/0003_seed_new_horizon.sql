INSERT OR IGNORE INTO churches (
  id, name, pastor, denomination, mission, address, phone, email,
  website, service_times, vibe, connect_card_url, groups_url,
  next_steps, bible_translation, connect_card_contact, active, created_at
) VALUES (
  "new-horizon-champaign",
  "New Horizon Church",
  "Pastor Mark Jordan",
  "Global Methodist Church",
  "Love God, Love Others & Make Disciples",
  "3002 W. Bloomington Rd., Champaign, IL 61822",
  "217-359-8909",
  "Info@NewHorizonChurch.org",
  "https://newhorizonchurch.org",
  "Sundays at 10:30 AM",
  "Dressed-down, band-led, user-friendly, Jesus-centered",
  "https://newhorizonchampaign.churchcenter.com/people/forms/608063",
  "https://newhorizonchampaign.churchcenter.com/groups/2025-26-school-year-groups",
  json('["Visit on Sunday at 10:30 AM — come as you are", "Fill out a connect card online or at the welcome center", "Sara Easter (our church administrator) will reach out to welcome you personally", "Join a small group through the Church Center App", "Find a ministry to serve in"]'),
  "NIV",
  "Sara Easter (church administrator) will follow up with you personally by email or phone",
  1,
  strftime("%s", "now")
);
