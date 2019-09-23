'use strict';

function getLocation (query, client, superagent) {
  return checkLocation(query, client)
    .then(location => location ? location : newLocation(query, superagent));
}

function checkLocation(query, client) {
  const sql = 'SELECT * FROM locations  WHERE search_query=$1;';
  const value = [query];

  return client.query(sql, value).then(result => result.rows[0])
}

function newLocation(query, superagent, client) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${searchQuery}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent
    .get(url)
    .then(result => new Location(query, result.body.results[0]))
    .then(location => storeLocation(location, client));
}

function storeLocation (location, client) {
  const sql = 'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4);';
  const value = [location.search_query, location.formatted_query, location.latitude, location.longitude];

  client.query(sql, value).then(result => location);
}

function Location(searchQuery, locationData) {
  this.search_query = searchQuery;
  this.formatted_query = locationData.formatted_address;
  this.latitude = locationData.geometry.location.lat;
  this.longitude = locationData.geometry.location.lng;
}

module.export = getLocation;
