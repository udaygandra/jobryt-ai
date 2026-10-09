/**
 * scripts/build-global-cities.js
 * Generates comprehensive multi-country cities dataset with Tier 1, Tier 2, and Tier 3 cities
 * for public/data/global-cities.json and synchronizes data/config/geo-hierarchy.json.
 */

const fs = require('fs');
const path = require('path');

const RAW_COUNTRIES = {
  'US': {
    name: 'United States',
    flag: '🇺🇸',
    popular: ['New York, NY', 'San Francisco, CA', 'Seattle, WA', 'Austin, TX', 'Boston, MA', 'Chicago, IL', 'Remote'],
    cities: [
      // Tier 1 - Major Metropolises
      { city: 'New York', region: 'NY', formatted: 'New York, NY, USA', tier: 1 },
      { city: 'San Francisco', region: 'CA', formatted: 'San Francisco, CA, USA', tier: 1 },
      { city: 'Los Angeles', region: 'CA', formatted: 'Los Angeles, CA, USA', tier: 1 },
      { city: 'Chicago', region: 'IL', formatted: 'Chicago, IL, USA', tier: 1 },
      { city: 'Seattle', region: 'WA', formatted: 'Seattle, WA, USA', tier: 1 },
      { city: 'Boston', region: 'MA', formatted: 'Boston, MA, USA', tier: 1 },
      { city: 'Austin', region: 'TX', formatted: 'Austin, TX, USA', tier: 1 },
      { city: 'Dallas', region: 'TX', formatted: 'Dallas, TX, USA', tier: 1 },
      { city: 'Houston', region: 'TX', formatted: 'Houston, TX, USA', tier: 1 },
      { city: 'Washington', region: 'DC', formatted: 'Washington, DC, USA', tier: 1 },
      { city: 'Atlanta', region: 'GA', formatted: 'Atlanta, GA, USA', tier: 1 },
      { city: 'San Jose', region: 'CA', formatted: 'San Jose, CA, USA', tier: 1 },
      { city: 'San Diego', region: 'CA', formatted: 'San Diego, CA, USA', tier: 1 },
      { city: 'Denver', region: 'CO', formatted: 'Denver, CO, USA', tier: 1 },
      { city: 'Phoenix', region: 'AZ', formatted: 'Phoenix, AZ, USA', tier: 1 },
      { city: 'Philadelphia', region: 'PA', formatted: 'Philadelphia, PA, USA', tier: 1 },

      // Tier 2 - Prominent Commercial & State Capital Hubs
      { city: 'Portland', region: 'OR', formatted: 'Portland, OR, USA', tier: 2 },
      { city: 'Miami', region: 'FL', formatted: 'Miami, FL, USA', tier: 2 },
      { city: 'Raleigh', region: 'NC', formatted: 'Raleigh, NC, USA', tier: 2 },
      { city: 'Charlotte', region: 'NC', formatted: 'Charlotte, NC, USA', tier: 2 },
      { city: 'Minneapolis', region: 'MN', formatted: 'Minneapolis, MN, USA', tier: 2 },
      { city: 'Salt Lake City', region: 'UT', formatted: 'Salt Lake City, UT, USA', tier: 2 },
      { city: 'Pittsburgh', region: 'PA', formatted: 'Pittsburgh, PA, USA', tier: 2 },
      { city: 'Nashville', region: 'TN', formatted: 'Nashville, TN, USA', tier: 2 },
      { city: 'Columbus', region: 'OH', formatted: 'Columbus, OH, USA', tier: 2 },
      { city: 'Indianapolis', region: 'IN', formatted: 'Indianapolis, IN, USA', tier: 2 },
      { city: 'Baltimore', region: 'MD', formatted: 'Baltimore, MD, USA', tier: 2 },
      { city: 'Las Vegas', region: 'NV', formatted: 'Las Vegas, NV, USA', tier: 2 },
      { city: 'Detroit', region: 'MI', formatted: 'Detroit, MI, USA', tier: 2 },
      { city: 'Tampa', region: 'FL', formatted: 'Tampa, FL, USA', tier: 2 },
      { city: 'Orlando', region: 'FL', formatted: 'Orlando, FL, USA', tier: 2 },
      { city: 'Kansas City', region: 'MO', formatted: 'Kansas City, MO, USA', tier: 2 },
      { city: 'Cleveland', region: 'OH', formatted: 'Cleveland, OH, USA', tier: 2 },
      { city: 'Cincinnati', region: 'OH', formatted: 'Cincinnati, OH, USA', tier: 2 },
      { city: 'Sacramento', region: 'CA', formatted: 'Sacramento, CA, USA', tier: 2 },
      { city: 'Milwaukee', region: 'WI', formatted: 'Milwaukee, WI, USA', tier: 2 },
      { city: 'St. Louis', region: 'MO', formatted: 'St. Louis, MO, USA', tier: 2 },
      { city: 'Richmond', region: 'VA', formatted: 'Richmond, VA, USA', tier: 2 },
      { city: 'San Antonio', region: 'TX', formatted: 'San Antonio, TX, USA', tier: 2 },
      { city: 'Fort Worth', region: 'TX', formatted: 'Fort Worth, TX, USA', tier: 2 },
      { city: 'Jacksonville', region: 'FL', formatted: 'Jacksonville, FL, USA', tier: 2 },
      { city: 'Oklahoma City', region: 'OK', formatted: 'Oklahoma City, OK, USA', tier: 2 },

      // Tier 3 - Secondary Tech Centers, University & Regional Cities
      { city: 'Boulder', region: 'CO', formatted: 'Boulder, CO, USA', tier: 3 },
      { city: 'Boise', region: 'ID', formatted: 'Boise, ID, USA', tier: 3 },
      { city: 'Madison', region: 'WI', formatted: 'Madison, WI, USA', tier: 3 },
      { city: 'Huntsville', region: 'AL', formatted: 'Huntsville, AL, USA', tier: 3 },
      { city: 'Durham', region: 'NC', formatted: 'Durham, NC, USA', tier: 3 },
      { city: 'Knoxville', region: 'TN', formatted: 'Knoxville, TN, USA', tier: 3 },
      { city: 'Omaha', region: 'NE', formatted: 'Omaha, NE, USA', tier: 3 },
      { city: 'Des Moines', region: 'IA', formatted: 'Des Moines, IA, USA', tier: 3 },
      { city: 'Spokane', region: 'WA', formatted: 'Spokane, WA, USA', tier: 3 },
      { city: 'Charleston', region: 'SC', formatted: 'Charleston, SC, USA', tier: 3 },
      { city: 'Colorado Springs', region: 'CO', formatted: 'Colorado Springs, CO, USA', tier: 3 },
      { city: 'Reno', region: 'NV', formatted: 'Reno, NV, USA', tier: 3 },
      { city: 'Tucson', region: 'AZ', formatted: 'Tucson, AZ, USA', tier: 3 },
      { city: 'Albuquerque', region: 'NM', formatted: 'Albuquerque, NM, USA', tier: 3 },
      { city: 'Fresno', region: 'CA', formatted: 'Fresno, CA, USA', tier: 3 },
      { city: 'Grand Rapids', region: 'MI', formatted: 'Grand Rapids, MI, USA', tier: 3 },
      { city: 'Buffalo', region: 'NY', formatted: 'Buffalo, NY, USA', tier: 3 },
      { city: 'Rochester', region: 'NY', formatted: 'Rochester, NY, USA', tier: 3 },
      { city: 'Albany', region: 'NY', formatted: 'Albany, NY, USA', tier: 3 },
      { city: 'Providence', region: 'RI', formatted: 'Providence, RI, USA', tier: 3 },
      { city: 'Hartford', region: 'CT', formatted: 'Hartford, CT, USA', tier: 3 },
      { city: 'St. Petersburg', region: 'FL', formatted: 'St. Petersburg, FL, USA', tier: 3 },
      { city: 'Fort Lauderdale', region: 'FL', formatted: 'Fort Lauderdale, FL, USA', tier: 3 },
      { city: 'Louisville', region: 'KY', formatted: 'Louisville, KY, USA', tier: 3 },
      { city: 'Lexington', region: 'KY', formatted: 'Lexington, KY, USA', tier: 3 },
      { city: 'Greenville', region: 'SC', formatted: 'Greenville, SC, USA', tier: 3 },
      { city: 'Chattanooga', region: 'TN', formatted: 'Chattanooga, TN, USA', tier: 3 },
      { city: 'Memphis', region: 'TN', formatted: 'Memphis, TN, USA', tier: 3 },
      { city: 'Baton Rouge', region: 'LA', formatted: 'Baton Rouge, LA, USA', tier: 3 },
      { city: 'New Orleans', region: 'LA', formatted: 'New Orleans, LA, USA', tier: 3 },
      { city: 'Little Rock', region: 'AR', formatted: 'Little Rock, AR, USA', tier: 3 },
      { city: 'Fayetteville', region: 'AR', formatted: 'Fayetteville, AR, USA', tier: 3 },
      { city: 'Tulsa', region: 'OK', formatted: 'Tulsa, OK, USA', tier: 3 },
      { city: 'Wichita', region: 'KS', formatted: 'Wichita, KS, USA', tier: 3 },
      { city: 'El Paso', region: 'TX', formatted: 'El Paso, TX, USA', tier: 3 },
      { city: 'Corpus Christi', region: 'TX', formatted: 'Corpus Christi, TX, USA', tier: 3 },
      { city: 'Plano', region: 'TX', formatted: 'Plano, TX, USA', tier: 3 },
      { city: 'Irving', region: 'TX', formatted: 'Irving, TX, USA', tier: 3 },
      { city: 'Arlington', region: 'TX', formatted: 'Arlington, TX, USA', tier: 3 },
      { city: 'Newark', region: 'NJ', formatted: 'Newark, NJ, USA', tier: 3 },
      { city: 'Jersey City', region: 'NJ', formatted: 'Jersey City, NJ, USA', tier: 3 },
      { city: 'New Haven', region: 'CT', formatted: 'New Haven, CT, USA', tier: 3 },
      { city: 'Portland', region: 'ME', formatted: 'Portland, ME, USA', tier: 3 },
      { city: 'Burlington', region: 'VT', formatted: 'Burlington, VT, USA', tier: 3 },
      { city: 'Manchester', region: 'NH', formatted: 'Manchester, NH, USA', tier: 3 },
      { city: 'Sioux Falls', region: 'SD', formatted: 'Sioux Falls, SD, USA', tier: 3 },
      { city: 'Fargo', region: 'ND', formatted: 'Fargo, ND, USA', tier: 3 },
      { city: 'Billings', region: 'MT', formatted: 'Billings, MT, USA', tier: 3 },
      { city: 'Cheyenne', region: 'WY', formatted: 'Cheyenne, WY, USA', tier: 3 },
      { city: 'Anchorage', region: 'AK', formatted: 'Anchorage, AK, USA', tier: 3 },
      { city: 'Honolulu', region: 'HI', formatted: 'Honolulu, HI, USA', tier: 3 }
    ]
  },
  'IN': {
    name: 'India',
    flag: '🇮🇳',
    popular: ['Bengaluru, KA', 'Hyderabad, TS', 'Pune, MH', 'Mumbai, MH', 'Delhi NCR', 'Chennai, TN', 'Remote'],
    cities: [
      // Tier 1 - Primary Mega Tech Metropolises
      { city: 'Bengaluru', region: 'KA', formatted: 'Bengaluru, KA, India', tier: 1 },
      { city: 'Hyderabad', region: 'TS', formatted: 'Hyderabad, TS, India', tier: 1 },
      { city: 'Pune', region: 'MH', formatted: 'Pune, MH, India', tier: 1 },
      { city: 'Mumbai', region: 'MH', formatted: 'Mumbai, MH, India', tier: 1 },
      { city: 'Delhi', region: 'DL', formatted: 'Delhi, DL, India', tier: 1 },
      { city: 'Chennai', region: 'TN', formatted: 'Chennai, TN, India', tier: 1 },
      { city: 'Kolkata', region: 'WB', formatted: 'Kolkata, WB, India', tier: 1 },
      { city: 'Ahmedabad', region: 'GJ', formatted: 'Ahmedabad, GJ, India', tier: 1 },

      // Tier 2 - Established Tech & Regional Capital Hubs
      { city: 'Gurgaon', region: 'HR', formatted: 'Gurgaon, HR, India', tier: 2 },
      { city: 'Noida', region: 'UP', formatted: 'Noida, UP, India', tier: 2 },
      { city: 'Navi Mumbai', region: 'MH', formatted: 'Navi Mumbai, MH, India', tier: 2 },
      { city: 'Jaipur', region: 'RJ', formatted: 'Jaipur, RJ, India', tier: 2 },
      { city: 'Lucknow', region: 'UP', formatted: 'Lucknow, UP, India', tier: 2 },
      { city: 'Chandigarh', region: 'CH', formatted: 'Chandigarh, CH, India', tier: 2 },
      { city: 'Indore', region: 'MP', formatted: 'Indore, MP, India', tier: 2 },
      { city: 'Coimbatore', region: 'TN', formatted: 'Coimbatore, TN, India', tier: 2 },
      { city: 'Kochi', region: 'KL', formatted: 'Kochi, KL, India', tier: 2 },
      { city: 'Visakhapatnam', region: 'AP', formatted: 'Visakhapatnam, AP, India', tier: 2 },
      { city: 'Surat', region: 'GJ', formatted: 'Surat, GJ, India', tier: 2 },
      { city: 'Vadodara', region: 'GJ', formatted: 'Vadodara, GJ, India', tier: 2 },
      { city: 'Nagpur', region: 'MH', formatted: 'Nagpur, MH, India', tier: 2 },
      { city: 'Bhopal', region: 'MP', formatted: 'Bhopal, MP, India', tier: 2 },
      { city: 'Patna', region: 'BR', formatted: 'Patna, BR, India', tier: 2 },
      { city: 'Bhubaneswar', region: 'OD', formatted: 'Bhubaneswar, OD, India', tier: 2 },
      { city: 'Thiruvananthapuram', region: 'KL', formatted: 'Thiruvananthapuram, KL, India', tier: 2 },
      { city: 'Vijayawada', region: 'AP', formatted: 'Vijayawada, AP, India', tier: 2 },
      { city: 'Ludhiana', region: 'PB', formatted: 'Ludhiana, PB, India', tier: 2 },
      { city: 'Agra', region: 'UP', formatted: 'Agra, UP, India', tier: 2 },
      { city: 'Nashik', region: 'MH', formatted: 'Nashik, MH, India', tier: 2 },
      { city: 'Faridabad', region: 'HR', formatted: 'Faridabad, HR, India', tier: 2 },
      { city: 'Ghaziabad', region: 'UP', formatted: 'Ghaziabad, UP, India', tier: 2 },
      { city: 'Rajkot', region: 'GJ', formatted: 'Rajkot, GJ, India', tier: 2 },
      { city: 'Varanasi', region: 'UP', formatted: 'Varanasi, UP, India', tier: 2 },
      { city: 'Amritsar', region: 'PB', formatted: 'Amritsar, PB, India', tier: 2 },
      { city: 'Ranchi', region: 'JH', formatted: 'Ranchi, JH, India', tier: 2 },
      { city: 'Guwahati', region: 'AS', formatted: 'Guwahati, AS, India', tier: 2 },
      { city: 'Jodhpur', region: 'RJ', formatted: 'Jodhpur, RJ, India', tier: 2 },
      { city: 'Madurai', region: 'TN', formatted: 'Madurai, TN, India', tier: 2 },
      { city: 'Raipur', region: 'CG', formatted: 'Raipur, CG, India', tier: 2 },

      // Tier 3 - Rapidly Emerging Industrial, University & Tier 3 Centers
      { city: 'Mysore', region: 'KA', formatted: 'Mysore, KA, India', tier: 3 },
      { city: 'Mangalore', region: 'KA', formatted: 'Mangalore, KA, India', tier: 3 },
      { city: 'Hubli', region: 'KA', formatted: 'Hubli, KA, India', tier: 3 },
      { city: 'Belgaum', region: 'KA', formatted: 'Belgaum, KA, India', tier: 3 },
      { city: 'Warangal', region: 'TS', formatted: 'Warangal, TS, India', tier: 3 },
      { city: 'Guntur', region: 'AP', formatted: 'Guntur, AP, India', tier: 3 },
      { city: 'Tirupati', region: 'AP', formatted: 'Tirupati, AP, India', tier: 3 },
      { city: 'Nellore', region: 'AP', formatted: 'Nellore, AP, India', tier: 3 },
      { city: 'Salem', region: 'TN', formatted: 'Salem, TN, India', tier: 3 },
      { city: 'Tiruchirappalli', region: 'TN', formatted: 'Tiruchirappalli, TN, India', tier: 3 },
      { city: 'Tiruppur', region: 'TN', formatted: 'Tiruppur, TN, India', tier: 3 },
      { city: 'Erode', region: 'TN', formatted: 'Erode, TN, India', tier: 3 },
      { city: 'Vellore', region: 'TN', formatted: 'Vellore, TN, India', tier: 3 },
      { city: 'Kozhikode', region: 'KL', formatted: 'Kozhikode, KL, India', tier: 3 },
      { city: 'Thrissur', region: 'KL', formatted: 'Thrissur, KL, India', tier: 3 },
      { city: 'Kollam', region: 'KL', formatted: 'Kollam, KL, India', tier: 3 },
      { city: 'Aurangabad', region: 'MH', formatted: 'Aurangabad, MH, India', tier: 3 },
      { city: 'Kolhapur', region: 'MH', formatted: 'Kolhapur, MH, India', tier: 3 },
      { city: 'Solapur', region: 'MH', formatted: 'Solapur, MH, India', tier: 3 },
      { city: 'Amravati', region: 'MH', formatted: 'Amravati, MH, India', tier: 3 },
      { city: 'Nanded', region: 'MH', formatted: 'Nanded, MH, India', tier: 3 },
      { city: 'Sangli', region: 'MH', formatted: 'Sangli, MH, India', tier: 3 },
      { city: 'Jalgaon', region: 'MH', formatted: 'Jalgaon, MH, India', tier: 3 },
      { city: 'Dehradun', region: 'UK', formatted: 'Dehradun, UK, India', tier: 3 },
      { city: 'Haridwar', region: 'UK', formatted: 'Haridwar, UK, India', tier: 3 },
      { city: 'Rishikesh', region: 'UK', formatted: 'Rishikesh, UK, India', tier: 3 },
      { city: 'Kanpur', region: 'UP', formatted: 'Kanpur, UP, India', tier: 3 },
      { city: 'Meerut', region: 'UP', formatted: 'Meerut, UP, India', tier: 3 },
      { city: 'Prayagraj', region: 'UP', formatted: 'Prayagraj, UP, India', tier: 3 },
      { city: 'Bareilly', region: 'UP', formatted: 'Bareilly, UP, India', tier: 3 },
      { city: 'Aligarh', region: 'UP', formatted: 'Aligarh, UP, India', tier: 3 },
      { city: 'Moradabad', region: 'UP', formatted: 'Moradabad, UP, India', tier: 3 },
      { city: 'Jalandhar', region: 'PB', formatted: 'Jalandhar, PB, India', tier: 3 },
      { city: 'Patiala', region: 'PB', formatted: 'Patiala, PB, India', tier: 3 },
      { city: 'Gwalior', region: 'MP', formatted: 'Gwalior, MP, India', tier: 3 },
      { city: 'Jabalpur', region: 'MP', formatted: 'Jabalpur, MP, India', tier: 3 },
      { city: 'Ujjain', region: 'MP', formatted: 'Ujjain, MP, India', tier: 3 },
      { city: 'Kota', region: 'RJ', formatted: 'Kota, RJ, India', tier: 3 },
      { city: 'Udaipur', region: 'RJ', formatted: 'Udaipur, RJ, India', tier: 3 },
      { city: 'Ajmer', region: 'RJ', formatted: 'Ajmer, RJ, India', tier: 3 },
      { city: 'Bikaner', region: 'RJ', formatted: 'Bikaner, RJ, India', tier: 3 },
      { city: 'Jamshedpur', region: 'JH', formatted: 'Jamshedpur, JH, India', tier: 3 },
      { city: 'Dhanbad', region: 'JH', formatted: 'Dhanbad, JH, India', tier: 3 },
      { city: 'Rourkela', region: 'OD', formatted: 'Rourkela, OD, India', tier: 3 },
      { city: 'Cuttack', region: 'OD', formatted: 'Cuttack, OD, India', tier: 3 },
      { city: 'Siliguri', region: 'WB', formatted: 'Siliguri, WB, India', tier: 3 },
      { city: 'Durgapur', region: 'WB', formatted: 'Durgapur, WB, India', tier: 3 },
      { city: 'Asansol', region: 'WB', formatted: 'Asansol, WB, India', tier: 3 },
      { city: 'Jammu', region: 'JK', formatted: 'Jammu, JK, India', tier: 3 },
      { city: 'Srinagar', region: 'JK', formatted: 'Srinagar, JK, India', tier: 3 }
    ]
  },
  'CA': {
    name: 'Canada',
    flag: '🇨🇦',
    popular: ['Toronto, ON', 'Vancouver, BC', 'Montreal, QC', 'Calgary, AB', 'Ottawa, ON', 'Waterloo, ON', 'Remote'],
    cities: [
      // Tier 1 - Primary Metropolises
      { city: 'Toronto', region: 'ON', formatted: 'Toronto, ON, Canada', tier: 1 },
      { city: 'Montreal', region: 'QC', formatted: 'Montreal, QC, Canada', tier: 1 },
      { city: 'Vancouver', region: 'BC', formatted: 'Vancouver, BC, Canada', tier: 1 },
      { city: 'Calgary', region: 'AB', formatted: 'Calgary, AB, Canada', tier: 1 },
      { city: 'Ottawa', region: 'ON', formatted: 'Ottawa, ON, Canada', tier: 1 },
      { city: 'Edmonton', region: 'AB', formatted: 'Edmonton, AB, Canada', tier: 1 },

      // Tier 2 - Regional Commercial & Tech Centers
      { city: 'Mississauga', region: 'ON', formatted: 'Mississauga, ON, Canada', tier: 2 },
      { city: 'Waterloo', region: 'ON', formatted: 'Waterloo, ON, Canada', tier: 2 },
      { city: 'Kitchener', region: 'ON', formatted: 'Kitchener, ON, Canada', tier: 2 },
      { city: 'Winnipeg', region: 'MB', formatted: 'Winnipeg, MB, Canada', tier: 2 },
      { city: 'Quebec City', region: 'QC', formatted: 'Quebec City, QC, Canada', tier: 2 },
      { city: 'Hamilton', region: 'ON', formatted: 'Hamilton, ON, Canada', tier: 2 },
      { city: 'Brampton', region: 'ON', formatted: 'Brampton, ON, Canada', tier: 2 },
      { city: 'Halifax', region: 'NS', formatted: 'Halifax, NS, Canada', tier: 2 },
      { city: 'London', region: 'ON', formatted: 'London, ON, Canada', tier: 2 },
      { city: 'Victoria', region: 'BC', formatted: 'Victoria, BC, Canada', tier: 2 },
      { city: 'Markham', region: 'ON', formatted: 'Markham, ON, Canada', tier: 2 },
      { city: 'Vaughan', region: 'ON', formatted: 'Vaughan, ON, Canada', tier: 2 },
      { city: 'Burnaby', region: 'BC', formatted: 'Burnaby, BC, Canada', tier: 2 },
      { city: 'Richmond', region: 'BC', formatted: 'Richmond, BC, Canada', tier: 2 },
      { city: 'Surrey', region: 'BC', formatted: 'Surrey, BC, Canada', tier: 2 },
      { city: 'Windsor', region: 'ON', formatted: 'Windsor, ON, Canada', tier: 2 },
      { city: 'Saskatoon', region: 'SK', formatted: 'Saskatoon, SK, Canada', tier: 2 },
      { city: 'Regina', region: 'SK', formatted: 'Regina, SK, Canada', tier: 2 },
      { city: 'St. John\'s', region: 'NL', formatted: 'St. John\'s, NL, Canada', tier: 2 },
      { city: 'Kelowna', region: 'BC', formatted: 'Kelowna, BC, Canada', tier: 2 },

      // Tier 3 - Regional Cities & Developing Tech Communities
      { city: 'Oakville', region: 'ON', formatted: 'Oakville, ON, Canada', tier: 3 },
      { city: 'Richmond Hill', region: 'ON', formatted: 'Richmond Hill, ON, Canada', tier: 3 },
      { city: 'Burlington', region: 'ON', formatted: 'Burlington, ON, Canada', tier: 3 },
      { city: 'Oshawa', region: 'ON', formatted: 'Oshawa, ON, Canada', tier: 3 },
      { city: 'Barrie', region: 'ON', formatted: 'Barrie, ON, Canada', tier: 3 },
      { city: 'Guelph', region: 'ON', formatted: 'Guelph, ON, Canada', tier: 3 },
      { city: 'Cambridge', region: 'ON', formatted: 'Cambridge, ON, Canada', tier: 3 },
      { city: 'Kingston', region: 'ON', formatted: 'Kingston, ON, Canada', tier: 3 },
      { city: 'Sherbrooke', region: 'QC', formatted: 'Sherbrooke, QC, Canada', tier: 3 },
      { city: 'Trois-Rivières', region: 'QC', formatted: 'Trois-Rivières, QC, Canada', tier: 3 },
      { city: 'Laval', region: 'QC', formatted: 'Laval, QC, Canada', tier: 3 },
      { city: 'Gatineau', region: 'QC', formatted: 'Gatineau, QC, Canada', tier: 3 },
      { city: 'Moncton', region: 'NB', formatted: 'Moncton, NB, Canada', tier: 3 },
      { city: 'Saint John', region: 'NB', formatted: 'Saint John, NB, Canada', tier: 3 },
      { city: 'Fredericton', region: 'NB', formatted: 'Fredericton, NB, Canada', tier: 3 },
      { city: 'Charlottetown', region: 'PE', formatted: 'Charlottetown, PE, Canada', tier: 3 },
      { city: 'Lethbridge', region: 'AB', formatted: 'Lethbridge, AB, Canada', tier: 3 },
      { city: 'Red Deer', region: 'AB', formatted: 'Red Deer, AB, Canada', tier: 3 },
      { city: 'Medicine Hat', region: 'AB', formatted: 'Medicine Hat, AB, Canada', tier: 3 },
      { city: 'Nanaimo', region: 'BC', formatted: 'Nanaimo, BC, Canada', tier: 3 },
      { city: 'Kamloops', region: 'BC', formatted: 'Kamloops, BC, Canada', tier: 3 },
      { city: 'Prince George', region: 'BC', formatted: 'Prince George, BC, Canada', tier: 3 },
      { city: 'Abbotsford', region: 'BC', formatted: 'Abbotsford, BC, Canada', tier: 3 },
      { city: 'Chilliwack', region: 'BC', formatted: 'Chilliwack, BC, Canada', tier: 3 },
      { city: 'Peterborough', region: 'ON', formatted: 'Peterborough, ON, Canada', tier: 3 },
      { city: 'Thunder Bay', region: 'ON', formatted: 'Thunder Bay, ON, Canada', tier: 3 },
      { city: 'Sudbury', region: 'ON', formatted: 'Sudbury, ON, Canada', tier: 3 },
      { city: 'Sault Ste. Marie', region: 'ON', formatted: 'Sault Ste. Marie, ON, Canada', tier: 3 },
      { city: 'Sarnia', region: 'ON', formatted: 'Sarnia, ON, Canada', tier: 3 },
      { city: 'Brantford', region: 'ON', formatted: 'Brantford, ON, Canada', tier: 3 }
    ]
  },
  'GB': {
    name: 'United Kingdom',
    flag: '🇬🇧',
    popular: ['London', 'Manchester', 'Edinburgh', 'Birmingham', 'Bristol', 'Cambridge', 'Remote'],
    cities: [
      // Tier 1
      { city: 'London', region: 'England', formatted: 'London, UK', tier: 1 },
      { city: 'Manchester', region: 'England', formatted: 'Manchester, UK', tier: 1 },
      { city: 'Birmingham', region: 'England', formatted: 'Birmingham, UK', tier: 1 },
      { city: 'Edinburgh', region: 'Scotland', formatted: 'Edinburgh, UK', tier: 1 },
      { city: 'Glasgow', region: 'Scotland', formatted: 'Glasgow, UK', tier: 1 },

      // Tier 2
      { city: 'Bristol', region: 'England', formatted: 'Bristol, UK', tier: 2 },
      { city: 'Cambridge', region: 'England', formatted: 'Cambridge, UK', tier: 2 },
      { city: 'Oxford', region: 'England', formatted: 'Oxford, UK', tier: 2 },
      { city: 'Leeds', region: 'England', formatted: 'Leeds, UK', tier: 2 },
      { city: 'Reading', region: 'England', formatted: 'Reading, UK', tier: 2 },
      { city: 'Newcastle', region: 'England', formatted: 'Newcastle, UK', tier: 2 },
      { city: 'Belfast', region: 'Northern Ireland', formatted: 'Belfast, UK', tier: 2 },
      { city: 'Sheffield', region: 'England', formatted: 'Sheffield, UK', tier: 2 },
      { city: 'Liverpool', region: 'England', formatted: 'Liverpool, UK', tier: 2 },
      { city: 'Cardiff', region: 'Wales', formatted: 'Cardiff, UK', tier: 2 },
      { city: 'Nottingham', region: 'England', formatted: 'Nottingham, UK', tier: 2 },
      { city: 'Southampton', region: 'England', formatted: 'Southampton, UK', tier: 2 },
      { city: 'Brighton', region: 'England', formatted: 'Brighton, UK', tier: 2 },
      { city: 'Leicester', region: 'England', formatted: 'Leicester, UK', tier: 2 },
      { city: 'Aberdeen', region: 'Scotland', formatted: 'Aberdeen, UK', tier: 2 },

      // Tier 3
      { city: 'Milton Keynes', region: 'England', formatted: 'Milton Keynes, UK', tier: 3 },
      { city: 'Swindon', region: 'England', formatted: 'Swindon, UK', tier: 3 },
      { city: 'Bath', region: 'England', formatted: 'Bath, UK', tier: 3 },
      { city: 'York', region: 'England', formatted: 'York, UK', tier: 3 },
      { city: 'Exeter', region: 'England', formatted: 'Exeter, UK', tier: 3 },
      { city: 'Plymouth', region: 'England', formatted: 'Plymouth, UK', tier: 3 },
      { city: 'Norwich', region: 'England', formatted: 'Norwich, UK', tier: 3 },
      { city: 'Derby', region: 'England', formatted: 'Derby, UK', tier: 3 },
      { city: 'Wolverhampton', region: 'England', formatted: 'Wolverhampton, UK', tier: 3 },
      { city: 'Swansea', region: 'Wales', formatted: 'Swansea, UK', tier: 3 },
      { city: 'Dundee', region: 'Scotland', formatted: 'Dundee, UK', tier: 3 },
      { city: 'Luton', region: 'England', formatted: 'Luton, UK', tier: 3 },
      { city: 'Northampton', region: 'England', formatted: 'Northampton, UK', tier: 3 },
      { city: 'Portsmouth', region: 'England', formatted: 'Portsmouth, UK', tier: 3 },
      { city: 'Bournemouth', region: 'England', formatted: 'Bournemouth, UK', tier: 3 },
      { city: 'Middlesbrough', region: 'England', formatted: 'Middlesbrough, UK', tier: 3 },
      { city: 'Sunderland', region: 'England', formatted: 'Sunderland, UK', tier: 3 },
      { city: 'Warrington', region: 'England', formatted: 'Warrington, UK', tier: 3 },
      { city: 'Peterborough', region: 'England', formatted: 'Peterborough, UK', tier: 3 },
      { city: 'Gloucester', region: 'England', formatted: 'Gloucester, UK', tier: 3 },
      { city: 'Watford', region: 'England', formatted: 'Watford, UK', tier: 3 },
      { city: 'Ipswich', region: 'England', formatted: 'Ipswich, UK', tier: 3 },
      { city: 'Cheltenham', region: 'England', formatted: 'Cheltenham, UK', tier: 3 },
      { city: 'Blackpool', region: 'England', formatted: 'Blackpool, UK', tier: 3 }
    ]
  },
  'DE': {
    name: 'Germany (DACH)',
    flag: '🇩🇪',
    popular: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne', 'Stuttgart', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Berlin', region: 'Berlin', formatted: 'Berlin, Germany', tier: 1 },
      { city: 'Munich', region: 'Bavaria', formatted: 'Munich, Germany', tier: 1 },
      { city: 'Frankfurt', region: 'Hesse', formatted: 'Frankfurt, Germany', tier: 1 },
      { city: 'Hamburg', region: 'Hamburg', formatted: 'Hamburg, Germany', tier: 1 },
      { city: 'Cologne', region: 'North Rhine-Westphalia', formatted: 'Cologne, Germany', tier: 1 },

      // Tier 2
      { city: 'Stuttgart', region: 'Baden-Württemberg', formatted: 'Stuttgart, Germany', tier: 2 },
      { city: 'Düsseldorf', region: 'North Rhine-Westphalia', formatted: 'Düsseldorf, Germany', tier: 2 },
      { city: 'Leipzig', region: 'Saxony', formatted: 'Leipzig, Germany', tier: 2 },
      { city: 'Dresden', region: 'Saxony', formatted: 'Dresden, Germany', tier: 2 },
      { city: 'Nuremberg', region: 'Bavaria', formatted: 'Nuremberg, Germany', tier: 2 },
      { city: 'Hanover', region: 'Lower Saxony', formatted: 'Hanover, Germany', tier: 2 },
      { city: 'Bonn', region: 'North Rhine-Westphalia', formatted: 'Bonn, Germany', tier: 2 },
      { city: 'Dortmund', region: 'North Rhine-Westphalia', formatted: 'Dortmund, Germany', tier: 2 },
      { city: 'Essen', region: 'North Rhine-Westphalia', formatted: 'Essen, Germany', tier: 2 },
      { city: 'Bremen', region: 'Bremen', formatted: 'Bremen, Germany', tier: 2 },
      { city: 'Karlsruhe', region: 'Baden-Württemberg', formatted: 'Karlsruhe, Germany', tier: 2 },

      // Tier 3
      { city: 'Mannheim', region: 'Baden-Württemberg', formatted: 'Mannheim, Germany', tier: 3 },
      { city: 'Heidelberg', region: 'Baden-Württemberg', formatted: 'Heidelberg, Germany', tier: 3 },
      { city: 'Freiburg', region: 'Baden-Württemberg', formatted: 'Freiburg, Germany', tier: 3 },
      { city: 'Augsburg', region: 'Bavaria', formatted: 'Augsburg, Germany', tier: 3 },
      { city: 'Wiesbaden', region: 'Hesse', formatted: 'Wiesbaden, Germany', tier: 3 },
      { city: 'Darmstadt', region: 'Hesse', formatted: 'Darmstadt, Germany', tier: 3 },
      { city: 'Münster', region: 'North Rhine-Westphalia', formatted: 'Münster, Germany', tier: 3 },
      { city: 'Aachen', region: 'North Rhine-Westphalia', formatted: 'Aachen, Germany', tier: 3 },
      { city: 'Bielefeld', region: 'North Rhine-Westphalia', formatted: 'Bielefeld, Germany', tier: 3 },
      { city: 'Bochum', region: 'North Rhine-Westphalia', formatted: 'Bochum, Germany', tier: 3 },
      { city: 'Duisburg', region: 'North Rhine-Westphalia', formatted: 'Duisburg, Germany', tier: 3 },
      { city: 'Wuppertal', region: 'North Rhine-Westphalia', formatted: 'Wuppertal, Germany', tier: 3 },
      { city: 'Gelsenkirchen', region: 'North Rhine-Westphalia', formatted: 'Gelsenkirchen, Germany', tier: 3 },
      { city: 'Mönchengladbach', region: 'North Rhine-Westphalia', formatted: 'Mönchengladbach, Germany', tier: 3 },
      { city: 'Braunschweig', region: 'Lower Saxony', formatted: 'Braunschweig, Germany', tier: 3 },
      { city: 'Kiel', region: 'Schleswig-Holstein', formatted: 'Kiel, Germany', tier: 3 },
      { city: 'Lübeck', region: 'Schleswig-Holstein', formatted: 'Lübeck, Germany', tier: 3 },
      { city: 'Erfurt', region: 'Thuringia', formatted: 'Erfurt, Germany', tier: 3 },
      { city: 'Rostock', region: 'Mecklenburg-Vorpommern', formatted: 'Rostock, Germany', tier: 3 },
      { city: 'Mainz', region: 'Rhineland-Palatinate', formatted: 'Mainz, Germany', tier: 3 },
      { city: 'Saarbrücken', region: 'Saarland', formatted: 'Saarbrücken, Germany', tier: 3 },
      { city: 'Potsdam', region: 'Brandenburg', formatted: 'Potsdam, Germany', tier: 3 },
      { city: 'Kassel', region: 'Hesse', formatted: 'Kassel, Germany', tier: 3 }
    ]
  },
  'AU': {
    name: 'Australia',
    flag: '🇦🇺',
    popular: ['Sydney, NSW', 'Melbourne, VIC', 'Brisbane, QLD', 'Perth, WA', 'Adelaide, SA', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Sydney', region: 'NSW', formatted: 'Sydney, NSW, Australia', tier: 1 },
      { city: 'Melbourne', region: 'VIC', formatted: 'Melbourne, VIC, Australia', tier: 1 },
      { city: 'Brisbane', region: 'QLD', formatted: 'Brisbane, QLD, Australia', tier: 1 },

      // Tier 2
      { city: 'Perth', region: 'WA', formatted: 'Perth, WA, Australia', tier: 2 },
      { city: 'Adelaide', region: 'SA', formatted: 'Adelaide, SA, Australia', tier: 2 },
      { city: 'Canberra', region: 'ACT', formatted: 'Canberra, ACT, Australia', tier: 2 },
      { city: 'Gold Coast', region: 'QLD', formatted: 'Gold Coast, QLD, Australia', tier: 2 },
      { city: 'Newcastle', region: 'NSW', formatted: 'Newcastle, NSW, Australia', tier: 2 },
      { city: 'Hobart', region: 'TAS', formatted: 'Hobart, TAS, Australia', tier: 2 },

      // Tier 3
      { city: 'Wollongong', region: 'NSW', formatted: 'Wollongong, NSW, Australia', tier: 3 },
      { city: 'Sunshine Coast', region: 'QLD', formatted: 'Sunshine Coast, QLD, Australia', tier: 3 },
      { city: 'Geelong', region: 'VIC', formatted: 'Geelong, VIC, Australia', tier: 3 },
      { city: 'Townsville', region: 'QLD', formatted: 'Townsville, QLD, Australia', tier: 3 },
      { city: 'Cairns', region: 'QLD', formatted: 'Cairns, QLD, Australia', tier: 3 },
      { city: 'Darwin', region: 'NT', formatted: 'Darwin, NT, Australia', tier: 3 },
      { city: 'Toowoomba', region: 'QLD', formatted: 'Toowoomba, QLD, Australia', tier: 3 },
      { city: 'Ballarat', region: 'VIC', formatted: 'Ballarat, VIC, Australia', tier: 3 },
      { city: 'Bendigo', region: 'VIC', formatted: 'Bendigo, VIC, Australia', tier: 3 },
      { city: 'Albury', region: 'NSW', formatted: 'Albury, NSW, Australia', tier: 3 },
      { city: 'Launceston', region: 'TAS', formatted: 'Launceston, TAS, Australia', tier: 3 },
      { city: 'Mackay', region: 'QLD', formatted: 'Mackay, QLD, Australia', tier: 3 },
      { city: 'Rockhampton', region: 'QLD', formatted: 'Rockhampton, QLD, Australia', tier: 3 },
      { city: 'Bunbury', region: 'WA', formatted: 'Bunbury, WA, Australia', tier: 3 },
      { city: 'Coffs Harbour', region: 'NSW', formatted: 'Coffs Harbour, NSW, Australia', tier: 3 }
    ]
  },
  'FR': {
    name: 'France',
    flag: '🇫🇷',
    popular: ['Paris', 'Lyon', 'Toulouse', 'Bordeaux', 'Nantes', 'Lille', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Paris', region: 'Île-de-France', formatted: 'Paris, France', tier: 1 },
      { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', formatted: 'Lyon, France', tier: 1 },
      { city: 'Marseille', region: 'Provence-Alpes-Côte d’Azur', formatted: 'Marseille, France', tier: 1 },

      // Tier 2
      { city: 'Toulouse', region: 'Occitanie', formatted: 'Toulouse, France', tier: 2 },
      { city: 'Bordeaux', region: 'Nouvelle-Aquitaine', formatted: 'Bordeaux, France', tier: 2 },
      { city: 'Lille', region: 'Hauts-de-France', formatted: 'Lille, France', tier: 2 },
      { city: 'Nantes', region: 'Pays de la Loire', formatted: 'Nantes, France', tier: 2 },
      { city: 'Nice', region: 'Provence-Alpes-Côte d’Azur', formatted: 'Nice, France', tier: 2 },
      { city: 'Strasbourg', region: 'Grand Est', formatted: 'Strasbourg, France', tier: 2 },
      { city: 'Rennes', region: 'Brittany', formatted: 'Rennes, France', tier: 2 },
      { city: 'Montpellier', region: 'Occitanie', formatted: 'Montpellier, France', tier: 2 },
      { city: 'Grenoble', region: 'Auvergne-Rhône-Alpes', formatted: 'Grenoble, France', tier: 2 },

      // Tier 3
      { city: 'Aix-en-Provence', region: 'Provence-Alpes-Côte d’Azur', formatted: 'Aix-en-Provence, France', tier: 3 },
      { city: 'Toulon', region: 'Provence-Alpes-Côte d’Azur', formatted: 'Toulon, France', tier: 3 },
      { city: 'Angers', region: 'Pays de la Loire', formatted: 'Angers, France', tier: 3 },
      { city: 'Dijon', region: 'Bourgogne-Franche-Comté', formatted: 'Dijon, France', tier: 3 },
      { city: 'Brest', region: 'Brittany', formatted: 'Brest, France', tier: 3 },
      { city: 'Le Mans', region: 'Pays de la Loire', formatted: 'Le Mans, France', tier: 3 },
      { city: 'Reims', region: 'Grand Est', formatted: 'Reims, France', tier: 3 },
      { city: 'Saint-Étienne', region: 'Auvergne-Rhône-Alpes', formatted: 'Saint-Étienne, France', tier: 3 },
      { city: 'Le Havre', region: 'Normandy', formatted: 'Le Havre, France', tier: 3 },
      { city: 'Clermont-Ferrand', region: 'Auvergne-Rhône-Alpes', formatted: 'Clermont-Ferrand, France', tier: 3 },
      { city: 'Tours', region: 'Centre-Val de Loire', formatted: 'Tours, France', tier: 3 },
      { city: 'Limoges', region: 'Nouvelle-Aquitaine', formatted: 'Limoges, France', tier: 3 },
      { city: 'Amiens', region: 'Hauts-de-France', formatted: 'Amiens, France', tier: 3 },
      { city: 'Perpignan', region: 'Occitanie', formatted: 'Perpignan, France', tier: 3 },
      { city: 'Metz', region: 'Grand Est', formatted: 'Metz, France', tier: 3 },
      { city: 'Besançon', region: 'Bourgogne-Franche-Comté', formatted: 'Besançon, France', tier: 3 },
      { city: 'Orléans', region: 'Centre-Val de Loire', formatted: 'Orléans, France', tier: 3 },
      { city: 'Mulhouse', region: 'Grand Est', formatted: 'Mulhouse, France', tier: 3 },
      { city: 'Caen', region: 'Normandy', formatted: 'Caen, France', tier: 3 },
      { city: 'Rouen', region: 'Normandy', formatted: 'Rouen, France', tier: 3 },
      { city: 'Nancy', region: 'Grand Est', formatted: 'Nancy, France', tier: 3 }
    ]
  },
  'NL': {
    name: 'Netherlands',
    flag: '🇳🇱',
    popular: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Remote'],
    cities: [
      { city: 'Amsterdam', region: 'North Holland', formatted: 'Amsterdam, Netherlands', tier: 1 },
      { city: 'Rotterdam', region: 'South Holland', formatted: 'Rotterdam, Netherlands', tier: 1 },
      { city: 'The Hague', region: 'South Holland', formatted: 'The Hague, Netherlands', tier: 1 },
      { city: 'Utrecht', region: 'Utrecht', formatted: 'Utrecht, Netherlands', tier: 1 },
      { city: 'Eindhoven', region: 'North Brabant', formatted: 'Eindhoven, Netherlands', tier: 1 },
      { city: 'Tilburg', region: 'North Brabant', formatted: 'Tilburg, Netherlands', tier: 2 },
      { city: 'Groningen', region: 'Groningen', formatted: 'Groningen, Netherlands', tier: 2 },
      { city: 'Almere', region: 'Flevoland', formatted: 'Almere, Netherlands', tier: 2 },
      { city: 'Breda', region: 'North Brabant', formatted: 'Breda, Netherlands', tier: 2 },
      { city: 'Nijmegen', region: 'Gelderland', formatted: 'Nijmegen, Netherlands', tier: 2 },
      { city: 'Enschede', region: 'Overijssel', formatted: 'Enschede, Netherlands', tier: 2 },
      { city: 'Haarlem', region: 'North Holland', formatted: 'Haarlem, Netherlands', tier: 2 },
      { city: 'Arnhem', region: 'Gelderland', formatted: 'Arnhem, Netherlands', tier: 2 },
      { city: 'Amersfoort', region: 'Utrecht', formatted: 'Amersfoort, Netherlands', tier: 3 },
      { city: 'Apeldoorn', region: 'Gelderland', formatted: 'Apeldoorn, Netherlands', tier: 3 },
      { city: '\'s-Hertogenbosch', region: 'North Brabant', formatted: '\'s-Hertogenbosch, Netherlands', tier: 3 },
      { city: 'Maastricht', region: 'Limburg', formatted: 'Maastricht, Netherlands', tier: 3 },
      { city: 'Leiden', region: 'South Holland', formatted: 'Leiden, Netherlands', tier: 3 },
      { city: 'Dordrecht', region: 'South Holland', formatted: 'Dordrecht, Netherlands', tier: 3 },
      { city: 'Zoetermeer', region: 'South Holland', formatted: 'Zoetermeer, Netherlands', tier: 3 },
      { city: 'Zwolle', region: 'Overijssel', formatted: 'Zwolle, Netherlands', tier: 3 },
      { city: 'Delft', region: 'South Holland', formatted: 'Delft, Netherlands', tier: 3 },
      { city: 'Alkmaar', region: 'North Holland', formatted: 'Alkmaar, Netherlands', tier: 3 },
      { city: 'Deventer', region: 'Overijssel', formatted: 'Deventer, Netherlands', tier: 3 },
      { city: 'Venlo', region: 'Limburg', formatted: 'Venlo, Netherlands', tier: 3 }
    ]
  },
  'AE': {
    name: 'UAE & Gulf (Middle East)',
    flag: '🇦🇪',
    popular: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Remote'],
    cities: [
      { city: 'Dubai', region: 'Dubai', formatted: 'Dubai, UAE', tier: 1 },
      { city: 'Abu Dhabi', region: 'Abu Dhabi', formatted: 'Abu Dhabi, UAE', tier: 1 },
      { city: 'Sharjah', region: 'Sharjah', formatted: 'Sharjah, UAE', tier: 2 },
      { city: 'Ajman', region: 'Ajman', formatted: 'Ajman, UAE', tier: 2 },
      { city: 'Ras Al Khaimah', region: 'Ras Al Khaimah', formatted: 'Ras Al Khaimah, UAE', tier: 2 },
      { city: 'Al Ain', region: 'Abu Dhabi', formatted: 'Al Ain, UAE', tier: 2 },
      { city: 'Fujairah', region: 'Fujairah', formatted: 'Fujairah, UAE', tier: 3 },
      { city: 'Umm Al Quwain', region: 'Umm Al Quwain', formatted: 'Umm Al Quwain, UAE', tier: 3 },
      { city: 'Khor Fakkan', region: 'Sharjah', formatted: 'Khor Fakkan, UAE', tier: 3 },
      { city: 'Dibba Al-Fujairah', region: 'Fujairah', formatted: 'Dibba Al-Fujairah, UAE', tier: 3 },
      { city: 'Kalba', region: 'Sharjah', formatted: 'Kalba, UAE', tier: 3 },
      { city: 'Madinat Zayed', region: 'Abu Dhabi', formatted: 'Madinat Zayed, UAE', tier: 3 },
      { city: 'Ruwais', region: 'Abu Dhabi', formatted: 'Ruwais, UAE', tier: 3 },
      { city: 'Hatta', region: 'Dubai', formatted: 'Hatta, UAE', tier: 3 }
    ]
  },
  'SG': {
    name: 'Singapore',
    flag: '🇸🇬',
    popular: ['Singapore', 'Jurong East', 'Tampines', 'Woodlands', 'Changi', 'Remote'],
    cities: [
      { city: 'Singapore', region: 'Central', formatted: 'Singapore', tier: 1 },
      { city: 'Marina Bay', region: 'Central', formatted: 'Marina Bay, Singapore', tier: 1 },
      { city: 'Jurong East', region: 'West', formatted: 'Jurong East, Singapore', tier: 2 },
      { city: 'Tampines', region: 'East', formatted: 'Tampines, Singapore', tier: 2 },
      { city: 'Woodlands', region: 'North', formatted: 'Woodlands, Singapore', tier: 2 },
      { city: 'Bedok', region: 'East', formatted: 'Bedok, Singapore', tier: 2 },
      { city: 'Ang Mo Kio', region: 'North-East', formatted: 'Ang Mo Kio, Singapore', tier: 3 },
      { city: 'Changi', region: 'East', formatted: 'Changi, Singapore', tier: 3 },
      { city: 'Novena', region: 'Central', formatted: 'Novena, Singapore', tier: 3 },
      { city: 'Queenstown', region: 'Central', formatted: 'Queenstown, Singapore', tier: 3 },
      { city: 'One-North', region: 'Queenstown', formatted: 'One-North, Singapore', tier: 3 }
    ]
  },
  'JP': {
    name: 'Japan',
    flag: '🇯🇵',
    popular: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Nagoya', 'Fukuoka', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Tokyo', region: 'Kanto', formatted: 'Tokyo, Japan', tier: 1 },
      { city: 'Osaka', region: 'Kansai', formatted: 'Osaka, Japan', tier: 1 },
      { city: 'Yokohama', region: 'Kanagawa', formatted: 'Yokohama, Japan', tier: 1 },
      { city: 'Kyoto', region: 'Kansai', formatted: 'Kyoto, Japan', tier: 1 },

      // Tier 2
      { city: 'Nagoya', region: 'Aichi', formatted: 'Nagoya, Japan', tier: 2 },
      { city: 'Fukuoka', region: 'Kyushu', formatted: 'Fukuoka, Japan', tier: 2 },
      { city: 'Sapporo', region: 'Hokkaido', formatted: 'Sapporo, Japan', tier: 2 },
      { city: 'Kobe', region: 'Hyogo', formatted: 'Kobe, Japan', tier: 2 },
      { city: 'Kawasaki', region: 'Kanagawa', formatted: 'Kawasaki, Japan', tier: 2 },
      { city: 'Saitama', region: 'Saitama', formatted: 'Saitama, Japan', tier: 2 },
      { city: 'Hiroshima', region: 'Chugoku', formatted: 'Hiroshima, Japan', tier: 2 },
      { city: 'Sendai', region: 'Tohoku', formatted: 'Sendai, Japan', tier: 2 },
      { city: 'Chiba', region: 'Chiba', formatted: 'Chiba, Japan', tier: 2 },
      { city: 'Kitakyushu', region: 'Fukuoka', formatted: 'Kitakyushu, Japan', tier: 2 },

      // Tier 3
      { city: 'Sakai', region: 'Osaka', formatted: 'Sakai, Japan', tier: 3 },
      { city: 'Niigata', region: 'Chubu', formatted: 'Niigata, Japan', tier: 3 },
      { city: 'Hamamatsu', region: 'Shizuoka', formatted: 'Hamamatsu, Japan', tier: 3 },
      { city: 'Kumamoto', region: 'Kyushu', formatted: 'Kumamoto, Japan', tier: 3 },
      { city: 'Sagamihara', region: 'Kanagawa', formatted: 'Sagamihara, Japan', tier: 3 },
      { city: 'Shizuoka', region: 'Shizuoka', formatted: 'Shizuoka, Japan', tier: 3 },
      { city: 'Okayama', region: 'Chugoku', formatted: 'Okayama, Japan', tier: 3 },
      { city: 'Kanazawa', region: 'Ishikawa', formatted: 'Kanazawa, Japan', tier: 3 },
      { city: 'Utsunomiya', region: 'Tochigi', formatted: 'Utsunomiya, Japan', tier: 3 },
      { city: 'Matsuyama', region: 'Ehime', formatted: 'Matsuyama, Japan', tier: 3 },
      { city: 'Oita', region: 'Kyushu', formatted: 'Oita, Japan', tier: 3 },
      { city: 'Takamatsu', region: 'Kagawa', formatted: 'Takamatsu, Japan', tier: 3 },
      { city: 'Toyama', region: 'Toyama', formatted: 'Toyama, Japan', tier: 3 },
      { city: 'Nagano', region: 'Nagano', formatted: 'Nagano, Japan', tier: 3 },
      { city: 'Nara', region: 'Nara', formatted: 'Nara, Japan', tier: 3 },
      { city: 'Gifu', region: 'Gifu', formatted: 'Gifu, Japan', tier: 3 }
    ]
  },
  'BR': {
    name: 'Brazil',
    flag: '🇧🇷',
    popular: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Brasília', 'Florianópolis', 'Remote'],
    cities: [
      // Tier 1
      { city: 'São Paulo', region: 'SP', formatted: 'São Paulo, Brazil', tier: 1 },
      { city: 'Rio de Janeiro', region: 'RJ', formatted: 'Rio de Janeiro, Brazil', tier: 1 },
      { city: 'Brasília', region: 'DF', formatted: 'Brasília, Brazil', tier: 1 },
      { city: 'Belo Horizonte', region: 'MG', formatted: 'Belo Horizonte, Brazil', tier: 1 },

      // Tier 2
      { city: 'Curitiba', region: 'PR', formatted: 'Curitiba, Brazil', tier: 2 },
      { city: 'Porto Alegre', region: 'RS', formatted: 'Porto Alegre, Brazil', tier: 2 },
      { city: 'Florianópolis', region: 'SC', formatted: 'Florianópolis, Brazil', tier: 2 },
      { city: 'Salvador', region: 'BA', formatted: 'Salvador, Brazil', tier: 2 },
      { city: 'Fortaleza', region: 'CE', formatted: 'Fortaleza, Brazil', tier: 2 },
      { city: 'Recife', region: 'PE', formatted: 'Recife, Brazil', tier: 2 },
      { city: 'Campinas', region: 'SP', formatted: 'Campinas, Brazil', tier: 2 },
      { city: 'Goiânia', region: 'GO', formatted: 'Goiânia, Brazil', tier: 2 },
      { city: 'Manaus', region: 'AM', formatted: 'Manaus, Brazil', tier: 2 },
      { city: 'Belém', region: 'PA', formatted: 'Belém, Brazil', tier: 2 },

      // Tier 3
      { city: 'São José dos Campos', region: 'SP', formatted: 'São José dos Campos, Brazil', tier: 3 },
      { city: 'Ribeirão Preto', region: 'SP', formatted: 'Ribeirão Preto, Brazil', tier: 3 },
      { city: 'Sorocaba', region: 'SP', formatted: 'Sorocaba, Brazil', tier: 3 },
      { city: 'Santos', region: 'SP', formatted: 'Santos, Brazil', tier: 3 },
      { city: 'Joinville', region: 'SC', formatted: 'Joinville, Brazil', tier: 3 },
      { city: 'Blumenau', region: 'SC', formatted: 'Blumenau, Brazil', tier: 3 },
      { city: 'Londrina', region: 'PR', formatted: 'Londrina, Brazil', tier: 3 },
      { city: 'Maringá', region: 'PR', formatted: 'Maringá, Brazil', tier: 3 },
      { city: 'Caxias do Sul', region: 'RS', formatted: 'Caxias do Sul, Brazil', tier: 3 },
      { city: 'Uberlândia', region: 'MG', formatted: 'Uberlândia, Brazil', tier: 3 },
      { city: 'Juiz de Fora', region: 'MG', formatted: 'Juiz de Fora, Brazil', tier: 3 },
      { city: 'Vitória', region: 'ES', formatted: 'Vitória, Brazil', tier: 3 },
      { city: 'Vila Velha', region: 'ES', formatted: 'Vila Velha, Brazil', tier: 3 },
      { city: 'Natal', region: 'RN', formatted: 'Natal, Brazil', tier: 3 },
      { city: 'João Pessoa', region: 'PB', formatted: 'João Pessoa, Brazil', tier: 3 },
      { city: 'Maceió', region: 'AL', formatted: 'Maceió, Brazil', tier: 3 },
      { city: 'Aracaju', region: 'SE', formatted: 'Aracaju, Brazil', tier: 3 },
      { city: 'Teresina', region: 'PI', formatted: 'Teresina, Brazil', tier: 3 },
      { city: 'São Luís', region: 'MA', formatted: 'São Luís, Brazil', tier: 3 },
      { city: 'Campo Grande', region: 'MS', formatted: 'Campo Grande, Brazil', tier: 3 },
      { city: 'Cuiabá', region: 'MT', formatted: 'Cuiabá, Brazil', tier: 3 }
    ]
  },
  'IT': {
    name: 'Italy',
    flag: '🇮🇹',
    popular: ['Milan', 'Rome', 'Turin', 'Bologna', 'Florence', 'Naples', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Milan', region: 'Lombardy', formatted: 'Milan, Italy', tier: 1 },
      { city: 'Rome', region: 'Lazio', formatted: 'Rome, Italy', tier: 1 },
      { city: 'Turin', region: 'Piedmont', formatted: 'Turin, Italy', tier: 1 },

      // Tier 2
      { city: 'Bologna', region: 'Emilia-Romagna', formatted: 'Bologna, Italy', tier: 2 },
      { city: 'Florence', region: 'Tuscany', formatted: 'Florence, Italy', tier: 2 },
      { city: 'Naples', region: 'Campania', formatted: 'Naples, Italy', tier: 2 },
      { city: 'Genoa', region: 'Liguria', formatted: 'Genoa, Italy', tier: 2 },
      { city: 'Venice', region: 'Veneto', formatted: 'Venice, Italy', tier: 2 },
      { city: 'Verona', region: 'Veneto', formatted: 'Verona, Italy', tier: 2 },
      { city: 'Padua', region: 'Veneto', formatted: 'Padua, Italy', tier: 2 },
      { city: 'Trieste', region: 'Friuli-Venezia Giulia', formatted: 'Trieste, Italy', tier: 2 },
      { city: 'Bari', region: 'Apulia', formatted: 'Bari, Italy', tier: 2 },
      { city: 'Palermo', region: 'Sicily', formatted: 'Palermo, Italy', tier: 2 },
      { city: 'Catania', region: 'Sicily', formatted: 'Catania, Italy', tier: 2 },

      // Tier 3
      { city: 'Brescia', region: 'Lombardy', formatted: 'Brescia, Italy', tier: 3 },
      { city: 'Bergamo', region: 'Lombardy', formatted: 'Bergamo, Italy', tier: 3 },
      { city: 'Monza', region: 'Lombardy', formatted: 'Monza, Italy', tier: 3 },
      { city: 'Parma', region: 'Emilia-Romagna', formatted: 'Parma, Italy', tier: 3 },
      { city: 'Modena', region: 'Emilia-Romagna', formatted: 'Modena, Italy', tier: 3 },
      { city: 'Reggio Emilia', region: 'Emilia-Romagna', formatted: 'Reggio Emilia, Italy', tier: 3 },
      { city: 'Ravenna', region: 'Emilia-Romagna', formatted: 'Ravenna, Italy', tier: 3 },
      { city: 'Perugia', region: 'Umbria', formatted: 'Perugia, Italy', tier: 3 },
      { city: 'Pisa', region: 'Tuscany', formatted: 'Pisa, Italy', tier: 3 },
      { city: 'Livorno', region: 'Tuscany', formatted: 'Livorno, Italy', tier: 3 },
      { city: 'Trento', region: 'Trentino-Alto Adige', formatted: 'Trento, Italy', tier: 3 },
      { city: 'Bolzano', region: 'Trentino-Alto Adige', formatted: 'Bolzano, Italy', tier: 3 },
      { city: 'Cagliari', region: 'Sardinia', formatted: 'Cagliari, Italy', tier: 3 },
      { city: 'Salerno', region: 'Campania', formatted: 'Salerno, Italy', tier: 3 },
      { city: 'Taranto', region: 'Apulia', formatted: 'Taranto, Italy', tier: 3 },
      { city: 'Pescara', region: 'Abruzzo', formatted: 'Pescara, Italy', tier: 3 }
    ]
  },
  'PL': {
    name: 'Poland',
    flag: '🇵🇱',
    popular: ['Warsaw', 'Kraków', 'Wrocław', 'Poznań', 'Gdańsk', 'Katowice', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Warsaw', region: 'Masovian', formatted: 'Warsaw, Poland', tier: 1 },
      { city: 'Kraków', region: 'Lesser Poland', formatted: 'Kraków, Poland', tier: 1 },
      { city: 'Wrocław', region: 'Lower Silesian', formatted: 'Wrocław, Poland', tier: 1 },

      // Tier 2
      { city: 'Poznań', region: 'Greater Poland', formatted: 'Poznań, Poland', tier: 2 },
      { city: 'Gdańsk', region: 'Pomeranian', formatted: 'Gdańsk, Poland', tier: 2 },
      { city: 'Katowice', region: 'Silesian', formatted: 'Katowice, Poland', tier: 2 },
      { city: 'Łódź', region: 'Łódź', formatted: 'Łódź, Poland', tier: 2 },
      { city: 'Szczecin', region: 'West Pomeranian', formatted: 'Szczecin, Poland', tier: 2 },
      { city: 'Lublin', region: 'Lublin', formatted: 'Lublin, Poland', tier: 2 },
      { city: 'Bydgoszcz', region: 'Kuyavian-Pomeranian', formatted: 'Bydgoszcz, Poland', tier: 2 },
      { city: 'Białystok', region: 'Podlaskie', formatted: 'Białystok, Poland', tier: 2 },
      { city: 'Gdynia', region: 'Pomeranian', formatted: 'Gdynia, Poland', tier: 2 },

      // Tier 3
      { city: 'Rzeszów', region: 'Subcarpathian', formatted: 'Rzeszów, Poland', tier: 3 },
      { city: 'Toruń', region: 'Kuyavian-Pomeranian', formatted: 'Toruń, Poland', tier: 3 },
      { city: 'Kielce', region: 'Holy Cross', formatted: 'Kielce, Poland', tier: 3 },
      { city: 'Gliwice', region: 'Silesian', formatted: 'Gliwice, Poland', tier: 3 },
      { city: 'Zabrze', region: 'Silesian', formatted: 'Zabrze, Poland', tier: 3 },
      { city: 'Bielsko-Biała', region: 'Silesian', formatted: 'Bielsko-Biała, Poland', tier: 3 },
      { city: 'Olsztyn', region: 'Warmian-Masurian', formatted: 'Olsztyn, Poland', tier: 3 },
      { city: 'Częstochowa', region: 'Silesian', formatted: 'Częstochowa, Poland', tier: 3 },
      { city: 'Radom', region: 'Masovian', formatted: 'Radom, Poland', tier: 3 },
      { city: 'Sosnowiec', region: 'Silesian', formatted: 'Sosnowiec, Poland', tier: 3 },
      { city: 'Opole', region: 'Opole', formatted: 'Opole, Poland', tier: 3 },
      { city: 'Zielona Góra', region: 'Lubusz', formatted: 'Zielona Góra, Poland', tier: 3 },
      { city: 'Tychy', region: 'Silesian', formatted: 'Tychy, Poland', tier: 3 },
      { city: 'Sopot', region: 'Pomeranian', formatted: 'Sopot, Poland', tier: 3 }
    ]
  },
  'ZA': {
    name: 'South Africa',
    flag: '🇿🇦',
    popular: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Gqeberha', 'Remote'],
    cities: [
      { city: 'Johannesburg', region: 'Gauteng', formatted: 'Johannesburg, South Africa', tier: 1 },
      { city: 'Cape Town', region: 'Western Cape', formatted: 'Cape Town, South Africa', tier: 1 },
      { city: 'Durban', region: 'KwaZulu-Natal', formatted: 'Durban, South Africa', tier: 1 },
      { city: 'Pretoria', region: 'Gauteng', formatted: 'Pretoria, South Africa', tier: 2 },
      { city: 'Gqeberha', region: 'Eastern Cape', formatted: 'Gqeberha, South Africa', tier: 2 },
      { city: 'Bloemfontein', region: 'Free State', formatted: 'Bloemfontein, South Africa', tier: 2 },
      { city: 'East London', region: 'Eastern Cape', formatted: 'East London, South Africa', tier: 2 },
      { city: 'Pietermaritzburg', region: 'KwaZulu-Natal', formatted: 'Pietermaritzburg, South Africa', tier: 2 },
      { city: 'Centurion', region: 'Gauteng', formatted: 'Centurion, South Africa', tier: 2 },
      { city: 'Sandton', region: 'Gauteng', formatted: 'Sandton, South Africa', tier: 2 },
      { city: 'Stellenbosch', region: 'Western Cape', formatted: 'Stellenbosch, South Africa', tier: 3 },
      { city: 'Nelspruit', region: 'Mpumalanga', formatted: 'Nelspruit, South Africa', tier: 3 },
      { city: 'Kimberley', region: 'Northern Cape', formatted: 'Kimberley, South Africa', tier: 3 },
      { city: 'Polokwane', region: 'Limpopo', formatted: 'Polokwane, South Africa', tier: 3 },
      { city: 'George', region: 'Western Cape', formatted: 'George, South Africa', tier: 3 },
      { city: 'Rustenburg', region: 'North West', formatted: 'Rustenburg, South Africa', tier: 3 },
      { city: 'Paarl', region: 'Western Cape', formatted: 'Paarl, South Africa', tier: 3 },
      { city: 'Richards Bay', region: 'KwaZulu-Natal', formatted: 'Richards Bay, South Africa', tier: 3 },
      { city: 'Witbank', region: 'Mpumalanga', formatted: 'Witbank, South Africa', tier: 3 },
      { city: 'Klerksdorp', region: 'North West', formatted: 'Klerksdorp, South Africa', tier: 3 }
    ]
  },
  'AT': {
    name: 'Austria',
    flag: '🇦🇹',
    popular: ['Vienna', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Remote'],
    cities: [
      { city: 'Vienna', region: 'Vienna', formatted: 'Vienna, Austria', tier: 1 },
      { city: 'Graz', region: 'Styria', formatted: 'Graz, Austria', tier: 2 },
      { city: 'Linz', region: 'Upper Austria', formatted: 'Linz, Austria', tier: 2 },
      { city: 'Salzburg', region: 'Salzburg', formatted: 'Salzburg, Austria', tier: 2 },
      { city: 'Innsbruck', region: 'Tyrol', formatted: 'Innsbruck, Austria', tier: 2 },
      { city: 'Klagenfurt', region: 'Carinthia', formatted: 'Klagenfurt, Austria', tier: 2 },
      { city: 'Villach', region: 'Carinthia', formatted: 'Villach, Austria', tier: 3 },
      { city: 'Wels', region: 'Upper Austria', formatted: 'Wels, Austria', tier: 3 },
      { city: 'Sankt Pölten', region: 'Lower Austria', formatted: 'Sankt Pölten, Austria', tier: 3 },
      { city: 'Dornbirn', region: 'Vorarlberg', formatted: 'Dornbirn, Austria', tier: 3 },
      { city: 'Wiener Neustadt', region: 'Lower Austria', formatted: 'Wiener Neustadt, Austria', tier: 3 },
      { city: 'Steyr', region: 'Upper Austria', formatted: 'Steyr, Austria', tier: 3 },
      { city: 'Feldkirch', region: 'Vorarlberg', formatted: 'Feldkirch, Austria', tier: 3 },
      { city: 'Bregenz', region: 'Vorarlberg', formatted: 'Bregenz, Austria', tier: 3 },
      { city: 'Baden', region: 'Lower Austria', formatted: 'Baden, Austria', tier: 3 }
    ]
  },
  'NZ': {
    name: 'New Zealand',
    flag: '🇳🇿',
    popular: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Remote'],
    cities: [
      { city: 'Auckland', region: 'Auckland', formatted: 'Auckland, New Zealand', tier: 1 },
      { city: 'Wellington', region: 'Wellington', formatted: 'Wellington, New Zealand', tier: 1 },
      { city: 'Christchurch', region: 'Canterbury', formatted: 'Christchurch, New Zealand', tier: 1 },
      { city: 'Hamilton', region: 'Waikato', formatted: 'Hamilton, New Zealand', tier: 2 },
      { city: 'Tauranga', region: 'Bay of Plenty', formatted: 'Tauranga, New Zealand', tier: 2 },
      { city: 'Dunedin', region: 'Otago', formatted: 'Dunedin, New Zealand', tier: 2 },
      { city: 'Palmerston North', region: 'Manawatū-Whanganui', formatted: 'Palmerston North, New Zealand', tier: 2 },
      { city: 'Napier', region: 'Hawke\'s Bay', formatted: 'Napier, New Zealand', tier: 3 },
      { city: 'Hastings', region: 'Hawke\'s Bay', formatted: 'Hastings, New Zealand', tier: 3 },
      { city: 'Nelson', region: 'Nelson', formatted: 'Nelson, New Zealand', tier: 3 },
      { city: 'Rotorua', region: 'Bay of Plenty', formatted: 'Rotorua, New Zealand', tier: 3 },
      { city: 'New Plymouth', region: 'Taranaki', formatted: 'New Plymouth, New Zealand', tier: 3 },
      { city: 'Whangārei', region: 'Northland', formatted: 'Whangārei, New Zealand', tier: 3 },
      { city: 'Invercargill', region: 'Southland', formatted: 'Invercargill, New Zealand', tier: 3 },
      { city: 'Whanganui', region: 'Manawatū-Whanganui', formatted: 'Whanganui, New Zealand', tier: 3 },
      { city: 'Gisborne', region: 'Gisborne', formatted: 'Gisborne, New Zealand', tier: 3 },
      { city: 'Queenstown', region: 'Otago', formatted: 'Queenstown, New Zealand', tier: 3 },
      { city: 'Blenheim', region: 'Marlborough', formatted: 'Blenheim, New Zealand', tier: 3 },
      { city: 'Taupō', region: 'Waikato', formatted: 'Taupō, New Zealand', tier: 3 }
    ]
  },
  'MX': {
    name: 'Mexico',
    flag: '🇲🇽',
    popular: ['Mexico City', 'Guadalajara', 'Monterrey', 'Querétaro', 'Puebla', 'Tijuana', 'Remote'],
    cities: [
      // Tier 1
      { city: 'Mexico City', region: 'CDMX', formatted: 'Mexico City, Mexico', tier: 1 },
      { city: 'Guadalajara', region: 'Jalisco', formatted: 'Guadalajara, Mexico', tier: 1 },
      { city: 'Monterrey', region: 'Nuevo León', formatted: 'Monterrey, Mexico', tier: 1 },

      // Tier 2
      { city: 'Querétaro', region: 'Querétaro', formatted: 'Querétaro, Mexico', tier: 2 },
      { city: 'Puebla', region: 'Puebla', formatted: 'Puebla, Mexico', tier: 2 },
      { city: 'Tijuana', region: 'Baja California', formatted: 'Tijuana, Mexico', tier: 2 },
      { city: 'Mérida', region: 'Yucatán', formatted: 'Mérida, Mexico', tier: 2 },
      { city: 'León', region: 'Guanajuato', formatted: 'León, Mexico', tier: 2 },
      { city: 'Juárez', region: 'Chihuahua', formatted: 'Juárez, Mexico', tier: 2 },
      { city: 'Zapopan', region: 'Jalisco', formatted: 'Zapopan, Mexico', tier: 2 },
      { city: 'San Luis Potosí', region: 'San Luis Potosí', formatted: 'San Luis Potosí, Mexico', tier: 2 },
      { city: 'Aguascalientes', region: 'Aguascalientes', formatted: 'Aguascalientes, Mexico', tier: 2 },
      { city: 'Hermosillo', region: 'Sonora', formatted: 'Hermosillo, Mexico', tier: 2 },
      { city: 'Saltillo', region: 'Coahuila', formatted: 'Saltillo, Mexico', tier: 2 },
      { city: 'Mexicali', region: 'Baja California', formatted: 'Mexicali, Mexico', tier: 2 },
      { city: 'Culiacán', region: 'Sinaloa', formatted: 'Culiacán, Mexico', tier: 2 },

      // Tier 3
      { city: 'Cancún', region: 'Quintana Roo', formatted: 'Cancún, Mexico', tier: 3 },
      { city: 'Chihuahua', region: 'Chihuahua', formatted: 'Chihuahua, Mexico', tier: 3 },
      { city: 'Morelia', region: 'Michoacán', formatted: 'Morelia, Mexico', tier: 3 },
      { city: 'Veracruz', region: 'Veracruz', formatted: 'Veracruz, Mexico', tier: 3 },
      { city: 'Toluca', region: 'State of Mexico', formatted: 'Toluca, Mexico', tier: 3 },
      { city: 'Torreón', region: 'Coahuila', formatted: 'Torreón, Mexico', tier: 3 },
      { city: 'Cuernavaca', region: 'Morelos', formatted: 'Cuernavaca, Mexico', tier: 3 },
      { city: 'Mazatlán', region: 'Sinaloa', formatted: 'Mazatlán, Mexico', tier: 3 },
      { city: 'Tampico', region: 'Tamaulipas', formatted: 'Tampico, Mexico', tier: 3 },
      { city: 'Reynosa', region: 'Tamaulipas', formatted: 'Reynosa, Mexico', tier: 3 },
      { city: 'Tuxtla Gutiérrez', region: 'Chiapas', formatted: 'Tuxtla Gutiérrez, Mexico', tier: 3 },
      { city: 'Playa del Carmen', region: 'Quintana Roo', formatted: 'Playa del Carmen, Mexico', tier: 3 },
      { city: 'Oaxaca', region: 'Oaxaca', formatted: 'Oaxaca, Mexico', tier: 3 },
      { city: 'Pachuca', region: 'Hidalgo', formatted: 'Pachuca, Mexico', tier: 3 },
      { city: 'Ensenada', region: 'Baja California', formatted: 'Ensenada, Mexico', tier: 3 },
      { city: 'Villahermosa', region: 'Tabasco', formatted: 'Villahermosa, Mexico', tier: 3 },
      { city: 'Irapuato', region: 'Guanajuato', formatted: 'Irapuato, Mexico', tier: 3 },
      { city: 'Celaya', region: 'Guanajuato', formatted: 'Celaya, Mexico', tier: 3 }
    ]
  },
  'GLOBAL': {
    name: 'Worldwide / Remote',
    flag: '🌐',
    popular: ['Remote', 'Worldwide', 'North America (Remote)', 'EMEA (Remote)', 'APAC (Remote)', 'Latin America (Remote)'],
    cities: [
      { city: 'Remote', region: 'Worldwide', formatted: 'Remote', tier: 1 },
      { city: 'Worldwide', region: 'Worldwide', formatted: 'Worldwide', tier: 1 },
      { city: 'North America', region: 'Remote', formatted: 'North America (Remote)', tier: 1 },
      { city: 'Europe', region: 'Remote', formatted: 'Europe (Remote)', tier: 1 },
      { city: 'EMEA', region: 'Remote', formatted: 'EMEA (Remote)', tier: 1 },
      { city: 'APAC', region: 'Remote', formatted: 'APAC (Remote)', tier: 1 },
      { city: 'Latin America', region: 'Remote', formatted: 'Latin America (Remote)', tier: 1 }
    ]
  }
};

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const targetJsonPath = path.join(rootDir, 'public', 'data', 'global-cities.json');
  const geoHierarchyPath = path.join(rootDir, 'data', 'config', 'geo-hierarchy.json');

  const byCountry = {};
  const allFormatted = new Set();
  const allCitiesList = [];

  for (const [code, meta] of Object.entries(RAW_COUNTRIES)) {
    const list = meta.cities.map(c => ({
      ...c,
      tier: c.tier || 2,
      country_code: code,
      country_name: meta.name,
      flag: meta.flag
    }));

    const tier1 = list.filter(c => c.tier === 1);
    const tier2 = list.filter(c => c.tier === 2);
    const tier3 = list.filter(c => c.tier === 3);

    byCountry[code] = {
      code,
      name: meta.name,
      flag: meta.flag,
      popular_hubs: meta.popular,
      counts: {
        total: list.length,
        tier1: tier1.length,
        tier2: tier2.length,
        tier3: tier3.length
      },
      cities: list
    };

    list.forEach(item => {
      if (!allFormatted.has(item.formatted)) {
        allFormatted.add(item.formatted);
        allCitiesList.push(item);
      }
    });
  }

  const outputPayload = {
    version: '2.0',
    total_countries: Object.keys(byCountry).length,
    total_cities: allCitiesList.length,
    by_country: byCountry,
    all: Array.from(allFormatted)
  };

  fs.writeFileSync(targetJsonPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  console.log(`✓ Wrote ${outputPayload.total_cities} cities across ${outputPayload.total_countries} countries to ${targetJsonPath}`);

  // Synchronize geo-hierarchy.json
  if (fs.existsSync(geoHierarchyPath)) {
    try {
      const geoData = JSON.parse(fs.readFileSync(geoHierarchyPath, 'utf8'));
      if (Array.isArray(geoData.metro_areas)) {
        const existingNames = new Set();
        geoData.metro_areas.forEach(m => {
          if (Array.isArray(m.names)) {
            m.names.forEach(n => existingNames.add(n.toLowerCase()));
          }
        });

        let addedCount = 0;
        for (const [code, meta] of Object.entries(RAW_COUNTRIES)) {
          if (code === 'GLOBAL') continue;
          meta.cities.forEach(c => {
            const cityName = c.city.toLowerCase();
            if (!existingNames.has(cityName)) {
              existingNames.add(cityName);
              geoData.metro_areas.push({
                names: [cityName],
                display_city: `${c.city}, ${meta.name}`,
                metro: `${c.city} Metro Region`,
                region: c.region,
                country: meta.name,
                country_code: code
              });
              addedCount++;
            }
          });
        }

        fs.writeFileSync(geoHierarchyPath, JSON.stringify(geoData, null, 2), 'utf8');
        console.log(`✓ Synchronized ${addedCount} new cities to data/config/geo-hierarchy.json (total metros: ${geoData.metro_areas.length})`);
      }
    } catch (err) {
      console.warn('Could not update geo-hierarchy.json:', err.message);
    }
  }
}

main();
