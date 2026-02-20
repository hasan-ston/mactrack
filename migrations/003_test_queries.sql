PRAGMA foreign_keys = ON;

-- Should return "ok"
PRAGMA integrity_check;

-- Should return zero rows
PRAGMA foreign_key_check;

INSERT OR IGNORE INTO users(email, display_name, password_hash)
VALUES ('test@example.com', 'Test User', 'fakehash');

INSERT OR IGNORE INTO course_reviews(user_id, subject, course_number, rating, difficulty, workload, text)
VALUES (
  (SELECT user_id FROM users WHERE email='test@example.com'),
  'ANTHROP', '1AA3', 5, 3, 3, 'Solid course'
);

-- Check course rating view, should return something
SELECT * FROM v_course_rating WHERE subject='ANTHROP' AND course_number='1AA3';

INSERT OR IGNORE INTO plan_terms(user_id, year_index, season)
VALUES ((SELECT user_id FROM users WHERE email='test@example.com'), 2, 'Winter');

INSERT OR IGNORE INTO plan_items(plan_term_id, subject, course_number, status)
VALUES ((SELECT plan_term_id FROM plan_terms WHERE user_id=(SELECT user_id FROM users WHERE email='test@example.com') AND year_index=2 AND season='Winter'),
        'COMPSCI', '2C03', 'PLANNED');

SELECT pt.year_index, pt.season, pi.subject, pi.course_number, pi.status
FROM plan_terms pt
LEFT JOIN plan_items pi ON pi.plan_term_id = pt.plan_term_id
WHERE pt.user_id = (SELECT user_id FROM users WHERE email='test@example.com')
ORDER BY pt.year_index, pt.season, pi.subject, pi.course_number;