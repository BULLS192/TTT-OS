(function(){
  'use strict';
  const catalog={
    "Acura":["Integra","TLX","RDX","MDX"],
    "Audi":["A3","A4","A5","A6","Q3","Q5","Q7","Q8"],
    "BMW":["2 Series","3 Series","4 Series","5 Series","X1","X3","X5","X7","i4","i5","iX"],
    "Cadillac":["CT4","CT5","XT4","XT5","XT6","Escalade","LYRIQ"],
    "Chevrolet":["Trax","Trailblazer","Equinox","Blazer","Traverse","Tahoe","Suburban","Colorado","Silverado 1500","Silverado HD","Corvette"],
    "Dodge":["Charger","Challenger","Durango","Hornet"],
    "Ford":["Mustang","Escape","Bronco Sport","Bronco","Explorer","Expedition","Maverick","Ranger","F-150","F-150 Lightning","Super Duty","Transit"],
    "GMC":["Terrain","Acadia","Yukon","Canyon","Sierra 1500","Sierra HD","Hummer EV"],
    "Honda":["Civic","Accord","HR-V","CR-V","Passport","Pilot","Ridgeline","Odyssey","Prologue"],
    "Hyundai":["Elantra","Sonata","Kona","Tucson","Santa Fe","Palisade","Santa Cruz","Ioniq 5","Ioniq 6"],
    "Jeep":["Compass","Grand Cherokee","Wrangler","Gladiator","Wagoneer","Grand Wagoneer"],
    "Kia":["K4","K5","Soul","Seltos","Sportage","Sorento","Telluride","Carnival","EV6","EV9"],
    "Lexus":["IS","ES","LS","UX","NX","RX","TX","GX","LX"],
    "Mercedes-Benz":["C-Class","E-Class","S-Class","CLA","CLE","GLA","GLB","GLC","GLE","GLS","G-Class","EQE","EQS"],
    "Nissan":["Versa","Sentra","Altima","Kicks","Rogue","Murano","Pathfinder","Armada","Frontier","Titan","Z","Leaf","Ariya"],
    "Porsche":["718","911","Panamera","Macan","Cayenne","Taycan"],
    "Ram":["1500","2500","3500","ProMaster"],
    "Rivian":["R1T","R1S"],
    "Subaru":["Impreza","WRX","BRZ","Crosstrek","Forester","Outback","Ascent","Solterra"],
    "Tesla":["Model 3","Model S","Model X","Model Y","Cybertruck"],
    "Toyota":["Corolla","Camry","Crown","Prius","GR86","Supra","Corolla Cross","RAV4","Highlander","Grand Highlander","4Runner","Land Cruiser","Sequoia","Tacoma","Tundra","Sienna","bZ4X"],
    "Volkswagen":["Jetta","Golf GTI","Golf R","Taos","Tiguan","Atlas","ID.4","ID. Buzz"],
    "Volvo":["S60","S90","XC40","XC60","XC90","EX30","EX90"]
  };
  const colors=[
    "Black","White","Gray","Silver","Blue","Red","Green","Brown",
    "Beige / Tan","Gold / Champagne","Orange","Yellow","Purple",
    "Bronze / Copper","Two-Tone","Other / Custom"
  ];
  window.TTTVehicleOptions={catalog,colors};
})();