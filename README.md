# Swarm Gateway

## Create schema

```sql
CREATE TABLE `allowedUserAgents` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `userAgent` varchar(100) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `reports` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `hash` varchar(128) NOT NULL,
  `reason` text,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `rewrites` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `subdomain` varchar(63) NOT NULL,
  `target` varchar(128) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `rules` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `hash` varchar(128) NOT NULL,
  `mode` enum('allow','deny') NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `settings` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `defaultWebsiteRule` enum('allow','deny') NOT NULL,
  `defaultFileRule` enum('allow','deny') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `rewrites`
  ADD UNIQUE KEY `idx_proxy_rewrites_subdomain_unique` (`subdomain`);

ALTER TABLE `rules`
  ADD UNIQUE KEY `idx_proxy_rules_hash_unique` (`hash`);

ALTER TABLE `settings`
  ADD UNIQUE KEY `idx_proxy_settings_name_unique` (`name`);
```
