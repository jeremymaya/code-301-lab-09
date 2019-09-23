'use strict';

// Dependencies
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');
const yelp = require('yelp-fusion');

const app = express();
app.use(cors());
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const client = new pg.Client(process.env.DATABASE_URL);

client.on('error', err => console.error(err));
client
  .connect()
  .then(() => {
    app.listen(PORT, () => console.log(`listening on ${PORT}`));
  })
  .catch(error => handleError(error));


// Routes
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/events', getEvents);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);
app.get('/trails', getTrails);
app.use('*', wildcardRouter);


// A function to retreive the searched location and render it on the page
function getLocation(request, response) {
  const searchQuery = request.query.data;
  const sql = 'SELECT * FROM locations  WHERE search_query=$1;';
  const value = [searchQuery];

  client
    .query(sql, value)
    .then(result => result.rows[0] ? response.status(200).send(result.rows[0]) : newLocation(searchQuery, response))
    .catch(error => handleError(error, response));
}

function newLocation(searchQuery, response) {
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
        .catch(error => handleError(error, response));
    })
    .catch(error => handleError(error, response));
}

function Location(searchQuery, locationData) {
  this.search_query = searchQuery;
  this.formatted_query = locationData.formatted_address;
  this.latitude = locationData.geometry.location.lat;
  this.longitude = locationData.geometry.location.lng;
}


// A function to retreive weather information for the searched location and render it on the page
function getWeather(request, response) {
  const searchQuery = request.query.data;
  const latitude = searchQuery.latitude;
  const longitude = searchQuery.longitude;
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${latitude},${longitude}`;

  superagent
    .get(url)
    .then(result => {
      const weatherData = result.body.daily.data;
      const weatherForecast = weatherData.map(dayObj => new Weather(dayObj));
      response.status(200).send(weatherForecast);
    })
    .catch(error => handleError(error, response));
}

function Weather(dayObj) {
  this.forecast = dayObj.summary;
  this.time = this.formattedDate(dayObj.time);
}

Weather.prototype.formattedDate = function(time) {
  let date = new Date(time*1000);
  return date.toDateString();
}


// A function to retreive event information for the searched location and render it on the page
function getEvents(request, response) {
  const searchQuery = request.query.data;
  const latitude = searchQuery.latitude;
  const longitude = searchQuery.longitude;
  const url = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${longitude}&location.latitude=${latitude}74&expand=venue&token=${process.env.EVENTBRITE_PUBLIC_TOKEN}`;

  superagent
    .get(url)
    .then(data => {
      const events = data.body.events.map(eventObj => new Event(eventObj));
      response.status(200).send(events);
    })
    .catch(error => handleError(error, response));
}

function Event(eventObj) {
  this.link = eventObj.url;
  this.name = eventObj.name.text;
  this.event_date = eventObj.start.local;
  this.summary = eventObj.summary;
}

// A function to retreive movie information for the searched location and render it on the page
function getMovies(request, response) {
  const searchQuery = request.query.data;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&language=en-US&page=1&query=${searchQuery.search_query}`;
  superagent
    .get(url)
    .then(data => {
      const movies = data.body.results.map(movieObj => new Movie(movieObj));
      const sortedMovies = movies.sort((a, b) => b.popularity - a.popularity);
      const topMovies = sortedMovies.splice(0, 20);
      response.status(200).send(topMovies);
    })
    .catch(error => handleError(error, response));
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


// A function to retreive yelp information for the searched location and render it on the page
function getYelp(request, response) {
  const searchQuery = request.query.data;
  const apiKey = process.env.YELP_API_KEY;

  const searchRequest = {
    location: searchQuery.search_query
  };

  const client = yelp.client(apiKey);

  client
    .search(searchRequest)
    .then(data => {
      const restaurants = data.jsonBody.businesses.map(restaurantObj => new Restaurant(restaurantObj));
      response.status(200).send(restaurants);
    })
    .catch(error => handleError(error, response));
}

function Restaurant(restaurantObj) {
  this.name = restaurantObj.name;
  this.image_url = restaurantObj.image_url;
  this.price = restaurantObj.price;
  this.rating = restaurantObj.rating;
  this.url = restaurantObj.url;
}

// A function to retreive trail information for the searched location and render it on the page
function getTrails(request, response) {
  const searchQuery = request.query.data;
  const latitude = searchQuery.latitude;
  const longitude = searchQuery.longitude;
  console.log(latitude);
  console.log(longitude);
  const url = `https://www.hikingproject.com/data/get-trails?lat=${latitude}&lon=${longitude}&key=${process.env.TRAIL_API_KEY}`;

  superagent
    .get(url)
    .then(data => {
      const trailData = data.body.trails;
      const trailInformation = trailData.map(trailObj => new Trail(trailObj));
      response.status(200).send(trailInformation);
    })
    .catch(error => handleError(error, response));
}

function Trail(trailObj) {
  this.name = trailObj.name;
  this.location = trailObj.location;
  this.length = trailObj.length;
  this.stars = trailObj.stars;
  this.star_votes = trailObj.starVotes;
  this.summary = trailObj.summary;
  this.trail_url = trailObj.url;
  this.conditions = trailObj.conditionStatus;
  this.condition_date = trailObj.conditionDate.split(' ')[0];
  this.condition_time = trailObj.conditionDate.split(' ')[1];
}

// A function to handle Error 404
function wildcardRouter(request, response) {
  response.status(404).send('Sorry, something went wrong');
}


// A function to handle Error 500
function handleError(error, response) {
  console.error(error);
  const err = new Error(error);
  if (response) {
    response.status(err.status).send(err.responseText);
  }
}

function Error(error) {
  this.status = 500;
  this.responseText = 'Sorry, something went wrong. ' + JSON.stringify(error);
  this.error = error;
}
