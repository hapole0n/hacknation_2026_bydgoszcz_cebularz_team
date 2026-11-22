# Polityka bezpieczeństwa / Security policy

## Zgłaszanie podatności (PL)

Podatność zgłoś **prywatnie**: w repozytorium na GitHubie wybierz *Security → Report a vulnerability*. Nie zakładaj publicznego zgłoszenia (issue) i nie wklejaj kluczy, zawartości `.env` ani prawdziwych danych osobowych. Opisz wersję (tag lub commit), kroki odtworzenia i skutek. Projekt powstał na hackathon HackNation 2026, więc odpowiedź to „best effort”.

Zasady projektu, które są częścią modelu bezpieczeństwa: wyłącznie dane z otwartych źródeł i dane syntetyczne w testach i demo; każde zapytanie wychodzące przechodzi przez `EgressClient` (lista dozwolonych hostów, limit, cache, dziennik zapytań); brak telemetrii i zewnętrznych skryptów lub czcionek; klucze tylko w `.env`.

## Reporting a vulnerability (EN)

Report privately via *Security → Report a vulnerability* on GitHub. Please do not open a public issue and do not include keys, `.env` contents or real personal data. Include the version (tag or commit), steps to reproduce and the impact. This is a hackathon project (HackNation 2026): replies are best effort.

## Supported versions

Only the latest tag on `main`.
