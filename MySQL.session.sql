
CREATE DATABASE IF NOT EXISTS bottling_plant_db;

USE bottling_plant_db;

CREATE TABLE IF NOT EXISTS production_summary (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total_bottles INT DEFAULT 0,
    accepted_bottles INT DEFAULT 0,
    rejected_bottles INT DEFAULT 0,
    total_box_packed INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bottle_number INT,
    weight_status VARCHAR(30),
    cap_status VARCHAR(30),
    inspection_status VARCHAR(30),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_batch (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_number VARCHAR(50),
    target_quantity INT DEFAULT 0,
    produced_quantity INT DEFAULT 0,
    batch_status VARCHAR(30),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SHOW TABLES;

-- View all records from each table
SELECT * FROM production_summary;
SELECT * FROM production_log;
SELECT * FROM production_batch;
SELECT * FROM users;

USE bottling_plant_db;

SELECT * FROM production_summary;
SELECT * FROM production_log;
SELECT * FROM production_batch;

SELECT
    (SELECT COUNT(*) FROM production_summary) AS summary_rows,
    (SELECT COUNT(*) FROM production_log) AS log_rows,
    (SELECT COUNT(*) FROM production_batch) AS batch_rows;