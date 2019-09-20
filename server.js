'use strict';

/**
 * Dependencies
 */

const express = require('express');
const cors = require('cors');
const app = express();
const superagent = require('superagent');
const pg = require('pg');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const yelp = require('yelp-fusion');
app.use(cors());

const client = new pg.Client(process.env.DATABASE_URL);
console.log(process.env.DATABASE_URL);
client.on('error', err => console.error(err));

client.connect()
  .then(() => {
    app.listen(PORT, () => console.log(`listening on ${PORT}`));
  })
  .catch(error => handleError(error));

/**
 * Routes
 */

app.get('/location', routeLocation);
app.get('/weather', getWeather);
app.get('/events', getEvents);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);
app.use('*', wildcardRouter);

/**
 * Routers
 */

function routeLocation(request, response) {
  const searchQuery = request.query.data;

  try{
    getLocation(searchQuery, response);
  }
  catch(err){
    handleError(err, response);
  }
}

function getLocation(searchQuery, response) {
  const sql = 'SELECT * FROM locations;';

  client
    .query(sql)
    .then(result => {
      let match = result.rows.filter(city => (city.search_query === searchQuery));
      match.length > 0 ? delete match[0].id && response.status(200).send(match[0]) : newLocation(searchQuery, response);})
    .catch(err => handleError(err, response));
}

function newLocation(searchQuery, response){
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${searchQuery}&key=${process.env.GEOCODE_API_KEY}`;

  superagent
    .get(url)
    .then(result => {
      const locationData = result.body.results[0];
      const location = new Location(searchQuery, locationData);

      const sql = 'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4);';
      const value = [location.search_query, location.formatted_query, location.latitude, location.longitude];

      client
        .query(sql, value)
        .then(response.status(200).send(location))
        .catch(error => handleError(error));
    })
}

function Location(searchQuery, locationData){
  this.search_query = searchQuery;
  this.formatted_query = locationData.formatted_address;
  this.latitude = locationData.geometry.location.lat;
  this.longitude = locationData.geometry.location.lng;
}

function getWeather(request, response) {
  const searchQuery = request.query.data;
  const latitude = searchQuery.latitude;
  const longitude = searchQuery.longitude;
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${latitude},${longitude}`

  superagent
    .get(url)
    .then(results => {
      const weatherData = results.body.daily.data;
      const weatherForecast = weatherData.map(dayObj => {
        return new Weather(dayObj);
      })
      response.status(200).send(weatherForecast);
    })
    .catch(error => {
      handleError(error, response);
    })
}

function Weather(dayObj){
  this.forecast = dayObj.summary;
  this.time = this.formattedDate(dayObj.time);
}

Weather.prototype.formattedDate = function(time) {
  let date = new Date(time*1000);
  return date.toDateString();
}

function getEvents(request, response) {
  const searchQuery = request.query.data;
  const latitude = searchQuery.latitude;
  const longitude = searchQuery.longitude;
  const url = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${longitude}&location.latitude=${latitude}74&expand=venue&token=${process.env.EVENTBRITE_PUBLIC_TOKEN}`;

  superagent.get(url)
    .then(data => {
      const events = data.body.events.map(obj => new Event(obj));
      response.status(200).send(events);
    })
    .catch(err => handleError(err, response));
}

function Event(obj) {
  this.link = obj.url;
  this.name = obj.name.text;
  this.event_date = obj.start.local;
  this.summary = obj.summary;
}

function getMovies(request, response) {
  const searchQuery = request.query.data;
  console.log(searchQuery.search_query);
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&language=en-US&page=1&query=${searchQuery.search_query}`;
  superagent
    .get(url)
    .then(data => {
      const movies = data.body.results.map(movieObj => new Movie(movieObj));
      const sortedMovies = movies.sort((a, b) => b.popularity - a.popularity);
      const topMovies = sortedMovies.splice(0, 20);
      response.status(200).send(topMovies);
    })
    .catch(err => handleError(err, response));
}

function Movie(movieObj) {
  this.title = movieObj.title;
  this.overview = movieObj.overview;
  this.average_votes = movieObj.vote_average;
  this.total_votes = movieObj.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/w500${movieObj.poster_path}`;
  this.popularity = movieObj.popularity;
  this.released_on = movieObj.release_date;
}

function getYelp(request, response){
  const searchQuery = request.query.data;
  const apiKey = process.env.YELP_API_KEY;

  const searchRequest = {
    location: searchQuery.search_query
  };

  const client = yelp.client(apiKey);

  client
    .search(searchRequest)
    .then(data => {
      // const restraunts = response.jsonBody.businesses;
      // console.log(restraunts);})
      const restaurants = data.jsonBody.businesses.map(restaurantObj => new Restaurant(restaurantObj));
      response.status(200).send(restaurants);
    })
    .catch(e => {
      console.log(e);
    });
}

function Restaurant(restaurantObj) {
  this.name = restaurantObj.name;
  this.image_url = restaurantObj.image_url;
  this.price = restaurantObj.price;
  this.rating = restaurantObj.rating;
  this.url = restaurantObj.url;
}




function wildcardRouter(request, response) {
  response.status(500).send('Sorry, something went wrong');
}

/**
 * Helper Objects and Functions
 */

function Error(err) {
  this.status = 500;
  this.responseText = 'Sorry, something went wrong. ' + JSON.stringify(err);
  this.error = err;
}

function handleError(err, response) {
  console.error(err);
  const error = new Error(err);
  if (response) {
    response.status(error.status).send(error.responseText);
  }
}

