import type { FoodRow } from './types';

// Curated 2026-09-04 from an independent chef-persona LLM review of the
// database after the automated category/cooked-duplicate/finished-product
// passes in this directory. These are specific fdc_ids the automated keyword
// filters can't catch, because their descriptions carry no dessert/candy-
// style marker word (e.g. "Soup, cream of mushroom, canned, condensed",
// "Bologna, beef") -- they're still finished/prepared products a
// health-conscious cook wouldn't select as a recipe component, as opposed to
// a raw cut, whole-muscle deli meat, or savory sauce (salsa, pesto, gravy),
// which were deliberately left as ingredients. Reviewed and confirmed by
// Renato before applying, including one explicit call against the reviewer's
// own inconsistency: hummus was flagged even though the reviewer separately
// said salsa/pesto/gravy should stay -- excluded anyway per Renato's ruling.
const MANUALLY_REVIEWED_NON_INGREDIENT_IDS = new Set<string>([
  '168027', // Soup, fish, homemade (Alaska Native)
  '171143', // Soup, bean with frankfurters, canned, condensed
  '172905', // Soup, bean with frankfurters, canned, prepared with equal volume water
  '171141', // Soup, black bean, canned, condensed
  '171142', // Soup, bean with pork, canned, condensed
  '171144', // Soup, bean with ham, canned, chunky, ready-to-serve
  '171145', // Soup, chicken, canned, chunky, ready-to-serve
  '171146', // Soup, cream of chicken, canned, condensed
  '171147', // Soup, chicken gumbo, canned, condensed
  '171148', // Soup, chunky chicken noodle, canned, ready-to-serve
  '171149', // Soup, chicken vegetable, canned, condensed
  '171150', // Soup, chili beef, canned, condensed
  '171151', // Soup, clam chowder, manhattan style, canned, chunky, ready-to-serve
  '171152', // Soup, clam chowder, manhattan, canned, condensed
  '171153', // Soup, minestrone, canned, condensed
  '171154', // Soup, mushroom barley, canned, condensed
  '171155', // Soup, cream of mushroom, canned, condensed
  '171157', // Soup, pea, split with ham, canned, condensed
  '171158', // Soup, cream of potato, canned, condensed
  '171159', // Soup, cream of shrimp, canned, condensed
  '171160', // Soup, tomato beef with noodle, canned, condensed
  '171161', // Soup, vegetarian vegetable, canned, condensed
  '171162', // Soup, chunky beef, canned, ready-to-serve
  '171163', // Soup, vegetable beef, canned, condensed
  '171165', // Soup, onion, dry, mix
  '171166', // Soup, cream of vegetable, dry, powder
  '171175', // Soup, beef mushroom, canned, condensed
  '171176', // Soup, tomato, canned, prepared with equal volume water, commercial
  '171177', // Soup, ramen noodle, any flavor, dry
  '171178', // Soup, broccoli cheese, canned, condensed, commercial
  '171181', // SMART SOUP, Indian Bean Masala
  '171182', // SMART SOUP, Moroccan Chick Pea
  '171183', // SMART SOUP, Thai Coconut Curry
  '171184', // SMART SOUP, Vietnamese Carrot Lemongrass
  '171189', // Soup, vegetable beef, microwavable, ready-to-serve, single brand
  '171190', // Soup, beef and vegetables, canned, ready-to-serve
  '171537', // Soup, cream of asparagus, canned, condensed
  '171539', // Soup, beef noodle, canned, condensed
  '171540', // Soup, cream of celery, canned, condensed
  '171541', // Soup, cheese, canned, condensed
  '171543', // Soup, chicken noodle, canned, condensed
  '171544', // Soup, chicken rice, canned, chunky, ready-to-serve
  '171545', // Soup, chicken with rice, canned, condensed
  '171546', // Soup, chicken and vegetable, canned, ready-to-serve
  '171547', // Soup, clam chowder, new england, canned, condensed
  '171549', // Soup, lentil with ham, canned, ready-to-serve
  '171550', // Soup, minestrone, canned, chunky, ready-to-serve
  '171551', // Soup, onion, canned, condensed
  '171552', // Soup, cream of onion, canned, condensed
  '171553', // Soup, oyster stew, canned, condensed
  '171554', // Soup, pea, green, canned, condensed
  '171555', // Soup, pea, split with ham, canned, chunky, ready-to-serve
  '171556', // CAMPBELL'S, Chicken Noodle Soup, condensed
  '171557', // Soup, tomato rice, canned, condensed
  '171558', // Soup, turkey, chunky, canned, ready-to-serve
  '171559', // Soup, chunky vegetable, canned, ready-to-serve
  '171571', // Soup, chicken noodle, dry, mix
  '171572', // Soup, beef mushroom, canned, prepared with equal volume water
  '171573', // Soup, chicken mushroom, canned, prepared with equal volume water
  '171574', // Soup, tomato bisque, canned, prepared with equal volume water
  '171576', // SMART SOUP, Santa Fe Corn Chowder
  '171577', // SMART SOUP, French Lentil
  '171578', // SMART SOUP, Greek Minestrone
  '171585', // Soup, chicken corn chowder, chunky, ready-to-serve, single brand
  '171586', // Soup, bean with bacon, condensed, single brand
  '171587', // Soup, tomato, canned, condensed, reduced sodium
  '171591', // Soup, tomato, low sodium, with water
  '171592', // Soup, pea, low sodium, prepared with equal volume water
  '171593', // Soup, chicken noodle, low sodium, canned, prepared with equal volume water
  '171594', // Soup, vegetable soup, condensed, low sodium, prepared with equal volume water
  '171596', // Soup, vegetable chicken, canned, prepared with water, low sodium
  '171602', // Soup, cream of chicken, canned, condensed, reduced sodium
  '171607', // Soup, cream of mushroom, low sodium, ready-to-serve, canned
  '171608', // Potato soup, instant, dry mix
  '171611', // Soup, beef and mushroom, low sodium, chunk style
  '171612', // Soup, beef stroganoff, canned, chunky style, ready-to-serve
  '171614', // Soup, ramen noodle, beef flavor, dry
  '171615', // Soup, ramen noodle, chicken flavor, dry
  '171821', // Soup, wonton, Chinese restaurant
  '171822', // Soup, ramen noodle, dry, any flavor, reduced fat, reduced sodium
  '172881', // Soup, tomato bisque, canned, condensed
  '172882', // Soup, tomato, canned, condensed
  '172887', // Soup, cream of mushroom, canned, condensed, reduced sodium
  '172891', // Soup, cream of asparagus, canned, prepared with equal volume milk
  '172892', // Soup, chicken vegetable with potato and cheese, chunky, ready-to-serve
  '172893', // Soup, cream of celery, canned, prepared with equal volume milk
  '172894', // Soup, cheese, canned, prepared with equal volume milk
  '172895', // Soup, oyster stew, canned, prepared with equal volume milk
  '172896', // Soup, pea, green, canned, prepared with equal volume milk
  '172897', // Soup, cream of potato, canned, prepared with equal volume milk
  '172898', // Soup, cream of shrimp, canned, prepared with equal volume low fat (2%) milk
  '172899', // Soup, HEALTHY CHOICE Chicken and Rice Soup, canned
  '172900', // Soup, HEALTHY CHOICE Garden Vegetable Soup, canned
  '172901', // CAMPBELL'S, Cream of Mushroom Soup, condensed
  '172902', // Soup, tomato bisque, canned, prepared with equal volume milk
  '172903', // Soup, black bean, canned, prepared with equal volume water
  '172904', // Soup, bean with pork, canned, prepared with equal volume water
  '172906', // Soup, beef noodle, canned, prepared with equal volume water
  '172907', // Soup, cream of celery, canned, prepared with equal volume water
  '172908', // Soup, chicken gumbo, canned, prepared with equal volume water
  '172909', // Soup, chicken noodle, canned, prepared with equal volume water
  '172910', // Soup, chicken with rice, canned, prepared with equal volume water
  '172911', // Soup, chili beef, canned, prepared with equal volume water
  '172912', // CAMPBELL'S CHUNKY, Old Fashioned Vegetable Beef Soup
  '172913', // Soup, minestrone, canned, prepared with equal volume water
  '172914', // Soup, mushroom barley, canned, prepared with equal volume water
  '172915', // Soup, cream of mushroom, canned, prepared with equal volume water
  '172916', // Soup, pea, split with ham, canned, prepared with equal volume water
  '172917', // Soup, cream of potato, canned, prepared with equal volume water
  '172918', // Soup, cream of shrimp, canned, prepared with equal volume water
  '172919', // Soup, tomato beef with noodle, canned, prepared with equal volume water
  '172920', // Soup, tomato rice, canned, prepared with equal volume water
  '172925', // Soup, chicken noodle, dry, mix, prepared with water
  '174062', // Soup, clam chowder, new england, canned, ready-to-serve
  '174063', // Soup, clam chowder, new england, reduced sodium, canned, ready-to-serve
  '174064', // Soup, chicken noodle, reduced sodium, canned, ready-to-serve
  '174065', // Soup, beef and vegetables, reduced sodium, canned, ready-to-serve
  '174071', // Soup, chunky vegetable, reduced sodium, canned, ready-to-serve
  '174073', // Soup, beef barley, ready to serve
  '174522', // Soup, chicken mushroom, canned, condensed
  '174530', // Soup, minestrone, canned, reduced sodium, ready-to-serve
  '174532', // Soup, shark fin, restaurant-prepared
  '174533', // Soup, bean & ham, canned, reduced sodium, prepared with water or ready-to-serve
  '174534', // Split pea soup, canned, reduced sodium, prepared with water or ready-to serve
  '174535', // Split pea with ham soup, canned, reduced sodium, prepared with water or ready-to-serve
  '174537', // Soup, cream of chicken, canned, prepared with equal volume milk
  '174538', // Soup, vegetable, canned, low sodium, condensed
  '174539', // Soup, clam chowder, new england, canned, prepared with equal volume low fat (2%) milk
  '174540', // Soup, cream of mushroom, canned, prepared with equal volume low fat (2%) milk
  '174541', // Soup, cream of onion, canned, prepared with equal volume milk
  '174545', // Soup, HEALTHY CHOICE Chicken Noodle Soup, canned
  '174546', // Soup, tomato, canned, prepared with equal volume low fat (2%) milk
  '174547', // CAMPBELL'S, Tomato Soup, condensed
  '174548', // CAMPBELL'S CHUNKY, Classic Chicken Noodle Soup
  '174549', // Soup, cream of asparagus, canned, prepared with equal volume water
  '174550', // Soup, cheese, canned, prepared with equal volume water
  '174552', // CAMPBELL'S CHUNKY, Hearty Beef Barley Soup
  '174553', // Soup, cream of chicken, canned, prepared with equal volume water
  '174554', // Soup, clam chowder, manhattan, canned, prepared with equal volume water
  '174555', // Soup, clam chowder, new england, canned, prepared with equal volume water
  '174559', // Soup, cream of onion, canned, prepared with equal volume water
  '174560', // Soup, oyster stew, canned, prepared with equal volume water
  '174561', // Soup, pea, green, canned, prepared with equal volume water
  '174562', // Soup, turkey noodle, canned, prepared with equal volume water
  '174563', // Soup, turkey vegetable, canned, prepared with equal volume water
  '174564', // Soup, vegetarian vegetable, canned, prepared with equal volume water
  '174565', // Soup, vegetable beef, canned, prepared with equal volume water
  '174567', // Soup, cream of chicken, dry, mix, prepared with water
  '174568', // Soup, onion, dry, mix, prepared with water
  '174569', // Soup, tomato, dry, mix, prepared with water
  '174807', // Soup, egg drop, Chinese restaurant
  '174808', // Soup, hot and sour, Chinese restaurant
  '169066', // Luncheon slices, meatless
  '172965', // Macaroni and cheese loaf, chicken, pork and beef
  '167696', // Frankfurter, beef, low fat
  '168131', // Frankfurter, low sodium
  '169866', // Frankfurter, meat and poultry, low fat
  '169887', // Frankfurter, meatless
  '171624', // Frankfurter, chicken
  '171625', // Frankfurter, turkey
  '171633', // Frankfurter, meat and poultry, cooked, boiled
  '171634', // Frankfurter, meat and poultry, cooked, grilled
  '172949', // Frankfurter, beef, pork, and turkey, fat free
  '172964', // Frankfurter, pork
  '172968', // Frankfurter, meat
  '173862', // Frankfurter, beef, unheated
  '173875', // Frankfurter, meat and poultry, unheated
  '174614', // Frankfurter, beef, heated
  '174615', // Frankfurter, meat, heated
  '167685', // Bologna, beef and pork, low fat
  '168101', // Bologna, beef, low fat
  '168118', // Beef, bologna, reduced sodium
  '171637', // Bologna, meat and poultry
  '172012', // Bologna, beef
  '172013', // Bologna, beef and pork
  '172970', // Bologna, chicken, turkey, pork
  '173856', // Bologna, pork
  '173857', // Bologna, turkey
  '173868', // Lebanon bologna, beef
  '173872', // Bologna, chicken, pork, beef
  '173873', // Bologna, chicken, pork
  '174589', // Oscar Mayer, Bologna (beef)
  '174609', // Bologna, pork and turkey, lite
  '174610', // Bologna, pork, turkey and beef
  '170202', // Beef, cured, luncheon meat, jellied
  '172950', // Luncheon meat, pork, ham, and chicken, minced, canned, reduced sodium, added ascorbic acid, includes SPAM, 25% less sodium
  '172951', // Luncheon meat, pork with ham, minced, canned, includes Spam (Hormel)
  '174571', // Luncheon meat, pork, canned
  '174594', // Luncheon meat, pork and chicken, minced, canned, includes Spam Lite
  '174587', // Luncheon sausage, pork and beef
  '171621', // Braunschweiger (a liver sausage), pork
  '172944', // Oscar Mayer, Braunschweiger Liver Sausage (sliced)
  '173870', // Liver sausage, liverwurst, pork
  '172969', // Scrapple, pork
  '171601', // Barbecue loaf, pork, beef
  '171623', // Cheesefurter, cheese smokie, pork, beef
  '171626', // Ham, chopped, canned
  '171627', // Ham, chopped, not canned
  '171628', // Ham and cheese loaf or roll
  '171630', // Headcheese, pork
  '172926', // Olive loaf, pork
  '172931', // Luxury loaf, pork
  '172932', // Mother's loaf, pork
  '172933', // Picnic loaf, pork, beef
  '172942', // Sausage, Vienna, canned, chicken, beef, pork
  '172943', // Honey roll sausage, beef
  '172946', // Oscar Mayer, Ham (chopped with natural juice)
  '173860', // Corned beef loaf, jellied
  '173861', // Dutch brand loaf, chicken, pork and beef
  '173865', // Ham, minced
  '173867', // Knackwurst, knockwurst, pork, beef
  '173869', // Liver cheese, pork
  '174573', // Mortadella, beef, pork
  '174574', // Peppered loaf, pork, beef
  '174576', // Pickle and pimiento loaf, pork
  '174591', // Oscar Mayer, Wieners (beef franks)
  '174601', // Swisswurst, pork and beef, with swiss cheese, smoked
  '174602', // Bacon and beef sticks
  '174608', // Chicken breast, roll, oven-roasted
  '174596', // Liverwurst spread
  '171100', // Pate de foie gras, canned (goose liver pate), smoked
  '172928', // Pate, chicken liver, canned
  '172929', // Pate, goose liver, smoked, canned
  '172930', // Pate, liver, not specified, canned
  '172967', // Pate, truffle flavor
  '171629', // Ham and cheese spread
  '173858', // Chicken spread
  '173866', // Ham salad spread
  '174581', // Poultry salad sandwich spread
  '174583', // Sandwich spread, pork, beef
  '174597', // Roast beef spread
  '167719', // Chicken, meatless, breaded, fried
  '169068', // Vegetarian fillets
  '169888', // Vegetarian meatloaf or patties
  '174195', // Fish, fish sticks, frozen, prepared
  '173721', // Salmon nuggets, breaded, frozen, heated
  '173722', // Salmon nuggets, cooked as purchased, unheated
  '172455', // Falafel, home-prepared
  '171103', // Turkey sticks, breaded, battered, fried
  '171111', // Chicken, wing, frozen, glazed, barbecue flavored
  '171115', // Chicken, wing, frozen, glazed, barbecue flavored, heated (conventional oven)
  '171512', // Chicken patty, frozen, uncooked
  '171513', // Chicken patty, frozen, cooked
  '171514', // Chicken breast tenders, breaded, cooked, microwaved
  '171515', // Chicken breast tenders, breaded, uncooked
  '171961', // Fish, gefiltefish, commercial, sweet recipe
  '171967', // Crustaceans, crab, blue, crab cakes, home recipe
  '174287', // Veggie burgers or soyburgers, unprepared
  '167513', // Pillsbury, Cinnamon Rolls with Icing, refrigerated dough
  '167534', // Cream puff, eclair, custard or cream filled, iced
  '167922', // Heinz, Weight Watcher, Chocolate Eclair, frozen
  '167940', // Cinnamon buns, frosted (includes honey buns)
  '167946', // SCHIFF,TIGER'S MILK BAR
  '167526', // Bread, salvadoran sweet cheese (quesadilla salvadorena)
  '170890', // Milk dessert bar, frozen, made from lowfat milk
  '174988', // Croissants, apple
  '174989', // Croissants, cheese
  '175032', // Strudel, apple
  '175033', // Sweet rolls, cheese
  '175034', // Sweet rolls, cinnamon, commercially prepared with raisins
  '173257', // Mckee Baking, Little Debbie Nutty Bars, Wafers with Peanut Butter, Chocolate Covered
  '168002', // Glutino, Gluten Free Wafers, Lemon Flavored
  '168003', // Glutino, Gluten Free Wafers, Milk Chocolate
  '173255', // Keebler, Keebler Chocolate Graham SELECTS
  '173730', // Yokan, prepared from adzuki beans and sugar
  '174906', // Bread, banana, prepared from recipe, made with margarine
  '175069', // Tart, breakfast, low fat
  '167516', // Waffles, buttermilk, frozen, ready-to-heat
  '167517', // Waffle, buttermilk, frozen, ready-to-heat, toasted
  '167518', // Waffle, buttermilk, frozen, ready-to-heat, microwaved
  '167519', // Waffle, plain, frozen, ready-to-heat, microwave
  '167524', // Waffles, chocolate chip, frozen, ready-to-heat
  '167926', // Pancakes, plain, frozen, ready-to-heat, microwave (includes buttermilk)
  '168011', // Van's, Gluten Free, Totally Original Waffles
  '167601', // Van's, Gluten Free, Totally Original Pancakes
  '167939', // Garlic bread, frozen
  '170092', // Potato pancakes
  '172763', // French toast, frozen, ready-to-heat
  '172771', // Pancakes plain, frozen, ready-to-heat (includes buttermilk)
  '172773', // Pancakes, blueberry, prepared from recipe
  '174086', // Pancakes, plain, reduced fat
  '175006', // Pancakes, plain, dry mix, complete, prepared
  '175008', // Pancakes, plain, dry mix, incomplete, prepared
  '175009', // Pancakes, plain, prepared from recipe
  '175010', // Pancakes, whole-wheat, dry mix, incomplete, prepared
  '175047', // Pancakes, buttermilk, prepared from recipe
  '175038', // Waffles, plain, frozen, ready-to-heat
  '175039', // Waffles, plain, prepared from recipe
  '175048', // Waffles, plain, frozen, ready -to-heat, toasted
  '174085', // Waffles, whole wheat, lowfat, frozen, ready-to-heat
  '174105', // Waffles, gluten-free, frozen, ready-to-heat
  '174106', // Pancakes, gluten-free, frozen, ready-to-heat
  '167604', // Potatoes, hash brown, refrigerated, unprepared
  '167605', // Potatoes, hash brown, refrigerated, prepared, pan-fried in canola oil
  '167606', // Sweet Potatoes, french fried, frozen as packaged, salt added in processing
  '168015', // Sweet Potatoes, french fried, crosscut, frozen, unprepared
  '168016', // Sweet Potato puffs, frozen, unprepared
  '169269', // Potato salad, home-prepared
  '169768', // Potatoes, mashed, ready-to-eat
  '170414', // Onion rings, breaded, par fried, frozen, unprepared
  '170415', // Onion rings, breaded, par fried, frozen, prepared, heated in oven
  '170047', // Potato puffs, frozen, unprepared
  '170048', // Potato puffs, frozen, oven-heated
  '170494', // Spinach souffle
  '168554', // Potatoes, mashed, prepared from granules, without milk, whole milk and margarine
  '168555', // Potatoes, mashed, home-prepared, whole milk and butter added
  '169372', // Potatoes, mashed, dehydrated, prepared from flakes without milk, whole milk and margarine added
  '170037', // Potatoes, mashed, home-prepared, whole milk and margarine added
  '170040', // Potatoes, mashed, dehydrated, prepared from granules without milk, whole milk and butter added
  '170042', // Potatoes, mashed, dehydrated, prepared from granules with milk, water and margarine added
  '170446', // Potatoes, mashed, dehydrated, prepared from flakes without milk, whole milk and butter added
  '170493', // Potatoes, mashed, home-prepared, whole milk added
  '170038', // Potatoes, scalloped, home-prepared with butter
  '170442', // Potatoes, au gratin, home-prepared from recipe using butter
  '170448', // Potatoes, au gratin, dry mix, prepared with water, whole milk and butter
  '170450', // Potatoes, scalloped, dry mix, prepared with water, whole milk and butter
  '170524', // Potatoes, au gratin, home-prepared from recipe using margarine
  '170525', // Potatoes, scalloped, home-prepared with margarine
  '174999', // Hush puppies, prepared from recipe
  '172747', // Crackers, wheat, sandwich, with cheese filling
  '172748', // Crackers, wheat, sandwich, with peanut butter filling
  '174983', // Crackers, standard snack-type, sandwich, with cheese filling
  '174984', // Crackers, standard snack-type, sandwich, with peanut butter filling
  '171855', // Crackers, whole grain, sandwich-type, with peanut butter filling
  '171848', // Crackers, sandwich-type, peanut butter filled, reduced fat
  '167529', // Crackers, snack, Goya Crackers
  '167530', // Crackers, cream, Gamesa Sabrosas
  '167531', // Crackers, cream, La Moderna Rikis Cream Crackers
  '167591', // Crunchmaster, Multi-Grain Crisps, Snack Crackers, Gluten-Free
  '167594', // Pepperidge Farm, Goldfish, Baked Snack Crackers, Original
  '167595', // Pepperidge Farm, Goldfish, Baked Snack Crackers, Parmesan
  '167596', // Pepperidge Farm, Goldfish, Baked Snack Crackers, Pizza
  '168005', // Pepperidge Farm, Goldfish, Baked Snack Crackers, Cheddar
  '168006', // Pepperidge Farm, Goldfish, Baked Snack Crackers, Explosive Pizza
  '168004', // Mary's Gone Crackers, Original Crackers, Organic Gluten Free
  '168012', // Van's, The Perfect 10, Crispy Six Whole Grain + Four Seed Baked Crackers, Gluten Free
  '167941', // Crackers, cheese, reduced fat
  '174084', // Crackers, cheese, whole grain
  '174975', // Crackers, cheese, regular
  '175060', // Crackers, cheese, low sodium
  '174098', // Crackers, flavored, fish-shaped
  '171846', // Crackers, standard snack-type, with whole wheat
  '174982', // Crackers, standard snack-type, regular
  '175058', // Crackers, standard snack-type, regular, low salt
  '173258', // Nabisco, Nabisco Ritz Crackers
  '172743', // Crackers, rye, sandwich-type with cheese filling
  '167727', // Beverages, ABBOTT, ENSURE PLUS, ready-to-drink
  '168750', // Alcoholic beverage, pina colada, canned
  '168752', // Alcoholic beverage, pina colada, prepared-from-recipe
  '168753', // Alcoholic beverage, tequila sunrise, canned
  '168771', // Chewing gum
  '169573', // Alcoholic beverage, daiquiri, canned
  '169574', // Alcoholic beverage, daiquiri, prepared-from-recipe
  '173169', // Beverages, NESTLE, Boost plus, nutritional drink, ready-to-drink
  '173170', // Beverages, SLIMFAST, Meal replacement, High Protein Shake, Ready-To-Drink, 3-2-1 plan
  '173171', // Beverages, UNILEVER, SLIMFAST, meal replacement, regular, ready-to-drink, 3-2-1 Plan
  '173172', // Beverages, UNILEVER, SLIMFAST Shake Mix, powder, 3-2-1 Plan
  '173174', // Beverages, UNILEVER, SLIMFAST Shake Mix, high protein, whey powder, 3-2-1 Plan
  '170892', // Nutritional supplement for people with diabetes, liquid
  '170883', // Milk shakes, thick chocolate
  '170884', // Milk shakes, thick vanilla
  '171258', // Eggnog
  '171939', // Beverages, Meal supplement drink, canned, peanut flavor
  '173226', // Shake, fast food, vanilla
  '173164', // Alcoholic beverage, whiskey sour, prepared with water, whiskey and powder mix
  '174181', // Beverages, nutritional shake mix, high protein, powder
  '174810', // Alcoholic beverage, whiskey sour, canned
  '174812', // Alcoholic beverage, whiskey sour, prepared from item 14028
  '173459', // Protein supplement, milk based, Muscle Milk, powder
  '173460', // Protein supplement, milk based, Muscle Milk Light, powder
  '174814', // Beverages, CYTOSPORT, Muscle Milk, ready-to-drink
  '174823', // Beverages, ABBOTT, ENSURE, Nutritional Shake, Ready-to-Drink
  '175102', // Beverages, shake, fast food, strawberry
  '168128', // Beans, baked, canned, no salt added
  '169065', // Beans, chili, barbecue, ranch style, cooked
  '175207', // Chili with beans, canned
  '173731', // Beans, baked, home prepared
  '173732', // Beans, baked, canned, with pork and sweet sauce
  '173733', // Beans, baked, canned, with pork and tomato sauce
  '175182', // Beans, baked, canned, plain or vegetarian
  '175183', // Beans, baked, canned, with beef
  '175184', // Beans, baked, canned, with franks
  '175185', // Beans, baked, canned, with pork
  '167636', // Tamales (Navajo)
  '167635', // Frybread, made with lard (Navajo)
  '167655', // Frybread, made with lard (Apache)
  '167656', // Corned beef and potatoes in tortilla (Apache)
  '167637', // Stew, steamed corn (Navajo)
  '168042', // Stew, dumpling with mutton (Navajo)
  '168043', // Stew, hominy with mutton (Navajo)
  '168044', // Stew, mutton, corn, squash (Navajo)
  '168061', // Acorn stew (Apache)
  '168106', // Papad
  '169004', // Piki bread, made from blue cornmeal (Hopi)
  '169006', // Stew, pinto bean and hominy, badufsuki (Hopi)
  '169007', // Tamales, masa and pork filling (Hopi)
  '168984', // Stew/soup, caribou (Alaska Native)
  '168991', // Stew, moose (Alaska Native)
  '169811', // Tennis Bread, plain (Apache)
  '168773', // Egg custards, dry mix, prepared with whole milk
  '168787', // Egg custards, dry mix, prepared with 2% milk
  '168789', // Rennin, chocolate, dry mix, prepared with 2% milk
  '168790', // Rennin, vanilla, dry mix, prepared with 2% milk
  '168793', // Rennin, vanilla, dry mix, prepared with whole milk
  '168796', // Flan, caramel custard, dry mix, prepared with whole milk
  '169617', // Rennin, chocolate, dry mix, prepared with whole milk
  '169621', // Flan, caramel custard, dry mix, prepared with 2% milk
  '170600', // Beef, sandwich steaks, flaked, chopped, formed and thinly sliced, raw
  '169735', // Noodles, flat, crunchy, Chinese restaurant
  '169904', // Eggs, scrambled, frozen mixture
  '171832', // Dip, bean, original flavor
  '171834', // Dip, FRITO'S, bean, original flavor
  '174068', // Dip, salsa con queso, cheese and salsa- medium
  '174069', // Dip, TOSTITOS, salsa con queso, medium
  '172454', // Hummus, home prepared
  '174289', // Hummus, commercial
  '171500', // Turkey and gravy, frozen
  '175160', // Fish, tuna salad
]);

export function excludeManuallyCuratedNonIngredients(foods: FoodRow[]): FoodRow[] {
  return foods.filter((food) => !MANUALLY_REVIEWED_NON_INGREDIENT_IDS.has(food.fdc_id));
}
