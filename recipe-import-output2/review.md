# Pantry Book recipe import report

Output backup: `pantry-book-import.pantrybook`

- Imported: 3
- Duplicates skipped: 0
- Failures: 6

## Imported recipes

- **Linguine alla Caprese (A Fresh and Easy Tomato Sauce)** — https://www.miascucina.com/linguine-alla-caprese-a-fresh-and-easy-tomato-sauce/?utm_source=Pinterest&utm_medium=organic
  - Photo imported from: https://i0.wp.com/www.miascucina.com/wp-content/uploads/2020/10/Linguine-alla-Caprese-Sqre-1.jpeg?fit=225%2C225&ssl=1
  - Warning: Could not read cook time duration “PT-497159H2M17S”.
  - Unmapped structured fields retained in raw artifact: aggregateRating, cookingMethod, datePublished, isPartOf, mainEntityOfPage, review, suitableForDiet, totalTime
- **Creamy Lemon Pasta** — https://thecollegehousewife.com/creamy-lemon-pasta?utm_source=Pinterest&utm_medium=organic
  - Photo imported from: https://everydayelizabeth.com/wp-content/uploads/2024/08/Lemon-Pasta-39-scaled.jpg
  - Unmapped structured fields retained in raw artifact: aggregateRating, datePublished, isPartOf, mainEntityOfPage, nutrition, review, totalTime
- **Spicy Yogurt-Marinated Chicken Tandoori with Cilantro Rice (Weeknight-Ready, Big Flavor)** — https://thehungrygoddess.com/chicken-tandoori-with-cilantro-rice/?utm_source=Pinterest&utm_medium=organic
  - Photo imported from: https://thehungrygoddess.com/wp-content/uploads/2026/02/recipe-spicy-yogurt-marinated-chicken-tandoori-with-cilantro-rice.webp
  - Warning: Instruction sections were flattened because Pantry Book stores a single ordered step list.
  - Unmapped structured fields retained in raw artifact: datePublished, isPartOf, mainEntityOfPage, totalTime

## Failures

- https://www.instagram.com/reel/C0hpP8YPGZk/?utm_source=ig_web_copy_link&igshid=MTdlMjRlYjZlMQ== — convert: No Recipe JSON-LD was found; used limited HTML metadata/itemprop fallback. No ingredients were found. No instructions were found. Recipe image was not imported: image request returned HTTP 403
- https://payhip.com/b/h4LuB?utm_source=Pinterest&utm_medium=organic — fetch: HTTP 403 Forbidden
- https://www.facebook.com/share/1CBje44xes/?mibextid=wwXIfr — convert: No Recipe JSON-LD was found; used limited HTML metadata/itemprop fallback. No ingredients were found. No instructions were found. Recipe image was not imported: No Recipe.image or og:image URL was found.
- https://www.thepastatable.com/post/prosciutto-caprese-pasta-salad?utm_source=Pinterest&utm_medium=organic — convert: No Recipe JSON-LD was found; used limited HTML metadata/itemprop fallback. No ingredients were found. No instructions were found.
- https://twistedfood.co.uk/?utm_source=Pinterest&utm_medium=organic — convert: No Recipe JSON-LD was found; used limited HTML metadata/itemprop fallback. No ingredients were found. No instructions were found.
- https://www.instagram.com/reel/DKkYBJAvTNo/?utm_source=Pinterest&utm_medium=organic — convert: No Recipe JSON-LD was found; used limited HTML metadata/itemprop fallback. No ingredients were found. No instructions were found. Recipe image was not imported: image request returned HTTP 403

