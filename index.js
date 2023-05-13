// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');

const bent = require('bent');
const getJSON = bent('json');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    function welcome(agent) {
        agent.add(`Welcome to my agent!`);
    }

    function fallback(agent) {
        agent.add(`I didn't understand`);
        agent.add(`I'm sorry, can you try again?`);
    }

    function getCountyName(county_structure) {
        return county_structure["subadmin-area"].replace(/ (county|parish)/i, '');
    }

    function latest(agent) {
        // Call the API to get the latest stats
        var type_array = agent.parameters.type;
        return getJSON("https://coronavirus-tracker-api.ruizlab.org/v2/latest?source=nyt")
            .then(json => {
                var return_str = [];
                for (var i = 0; i < type_array.length; i++) {
                    switch (type_array[i]) {
                        case "all":
                            return_str.push(`The number of deaths are ${json.latest.deaths}, the number of confirmed cases are ${json.latest.confirmed}, and the number of recovered are ${json.latest.recovered}`);
                            break;
                        case "deaths":
                            return_str.push(`The number of deaths are ${json.latest.deaths}. That is way too many.`);
                            break;
                        case "confirmed":
                            return_str.push(`The number of confirmed cases are ${json.latest.confirmed}.`);
                            break;
                        case "recovered":
                            return_str.push(`The number of recovered are ${json.latest.recovered}.`);
                            break;
                        default:
                            return_str.push(`I am not sure which stat you are asking for.`);
                            break;
                    }
                }
                // Return correct response
                agent.add(return_str.join(" "));
            })
            .catch(err => {
                console.log("An error occured receiving JSON " + err);
                agent.add("I'm sorry an error occured.");
            });
    }

    function location_stats(agent) {
        // Call the API with appropriate information
        // Send correct response
        var query = "";
        var is_country = false; // used to determine if we are looking at a country or not to handle source of query
        // Check if specified a state
        if (agent.parameters.city != "") {
            agent.add("I am sorry, do not have city level data. The lowest level data I have is county level.");
            return;
        }

        // Check if specified a county
        if (agent.parameters.county.length > 0) {
            if (agent.parameters.county.length > 1) {
                agent.add("I am sorry, I can only handle one county at a time.");
                return;
            }

            // check if specified a state
            if (agent.parameters.state.length > 0) {
                if (agent.parameters.state.length == 1) {
                    // if one then add it to query, otherwise handle on response
                    console.log("Adding state to query: " + agent.parameters.state[0]);
                    query = query + "&province=" + agent.parameters.state[0];
                }
                else {
                    // logging the states for debug
                    console.log("Found multiple states " + agent.parameters.state.join(", "));
                }

                query = query + "&county=" + getCountyName(agent.parameters.county[0]);
            }
            else {
                agent.add(`I am sorry, I also need to know the state of the county. Please ask again with the state`);
                return;
            }
        }
        else if (agent.parameters.state.length > 0) { // check if specified a state
            if (agent.parameters.state.length > 1) {
                agent.add("I am sorry, I can only handle one state at a time.");
                return;
            }

            query = query + "&province=" + agent.parameters.state[0];
        }

        // Check if specified a country
        if (agent.parameters.country.length > 0) {
            if (agent.parameters.country.length > 1) {
                agent.add("I am sorry, I can only handle one country at a time.");
                return;
            }

            if (agent.parameters.county.length > 0 && agent.parameters.country[0]["alpha-2"] != "US") {
                agent.add("I am sorry, I can only handle US counties.");
                return;
            }
            query = query + "&country_code=" + agent.parameters.country[0]["alpha-2"];

            // Only set this if not US
            is_country = agent.parameters.country[0]["alpha-2"] != "US";
        }

        // Check if specified a country
        if (is_country) {
            query = "https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=jhu&timelines=false" + query;
        }
        else {
            query = "https://coronavirus-tracker-api.ruizlab.org/v2/locations?source=nyt&timelines=false" + query;
        }

        console.log("Query: " + query);
        // Call API with appropriate info
        return getJSON(query).then(json => {
            console.log("Received response");
            console.log(json);
            var return_str = "";
            if (agent.parameters.county.length > 0) {
                console.log("In county results");
                console.log("json.locations.length: " + json.locations.length);
                var response_array = [];

                for (var i = 0; i < json.locations.length; i++) {
                    console.log("Checking state: " + json.locations[i].province);
                    if (!agent.parameters.state.includes(json.locations[i].province)) {
                        console.log("Not found in state list: " + agent.parameters.state.join(", "));
                        continue;
                    }
                    return_str = "";
                    console.log("Found state in list");

                    for (var j = 0; j < agent.parameters.type.length; j++) {
                        console.log("Handling type: " + agent.parameters.type[j] + "");
                        switch (agent.parameters.type[j]) {
                            case "all":
                                return_str = return_str + `The number of deaths in ${json.locations[i].county}, ${json.locations[i].province} are ${json.locations[i].latest.deaths}. The number of confirmed cases are ${json.locations[i].latest.confirmed}. The number of recovered are ${json.locations[i].latest.recovered}.`;
                                break;
                            case "deaths":
                                if (return_str != "") {
                                    return_str = return_str + `The number of deaths are ${json.locations[i].latest.deaths}`;
                                }
                                else {
                                    return_str = return_str + `The number of deaths in ${json.locations[i].county}, ${json.locations[i].province} are ${json.locations[i].latest.deaths}.`;
                                }
                                break;
                            case "confirmed":
                                if (return_str != "") {
                                    return_str = return_str + `The number of confirmed cases are ${json.locations[i].latest.confirmed}`;
                                }
                                else {
                                    return_str = return_str + `The number of confirmed cases in ${json.locations[i].county}, ${json.locations[i].province} are ${json.locations[i].latest.confirmed}.`;
                                }
                                break;
                            case "recovered":
                                if (return_str != "") {
                                    return_str = return_str + `The number of recovered are ${json.locations[i].latest.recovered}`;
                                }
                                else {
                                    return_str = return_str + `The number of recovered in ${json.locations[i].county}, ${json.locations[i].province} are ${json.locations[i].latest.recovered}.`;
                                }
                                break;
                            default:
                                return_str = `I am not sure which stats you are asking for`;
                                break;
                        }
                        console.log("Return str: " + return_str);
                        response_array.push(return_str);
                    }
                }
                agent.add(response_array.join(" "));
                return;
            }
            else if (agent.parameters.state.length > 0) {
                console.log("In state results");
                return_str = "";
                for (var j = 0; j < agent.parameters.type.length; j++) {
                    switch (agent.parameters.type[j]) {
                        case "all":
                            return_str = return_str + `The number of deaths in ${agent.parameters.state[0]} are ${json.latest.deaths}, the number of confirmed cases are ${json.latest.confirmed}, and the number of recovered are ${json.latest.recovered}`;
                            break;
                        case "deaths":
                            if (return_str != "") {
                                return_str = return_str + `The number of deaths are ${json.latest.deaths}.`;
                            }
                            else {
                                return_str = return_str + `The number of deaths in ${agent.parameters.state[0]} are ${json.latest.deaths}.`;
                            }
                            break;
                        case "confirmed":
                            if (return_str != "") {
                                return_str = return_str + `The number of confirmed cases are ${json.latest.confirmed}.`;
                            }
                            else {
                                return_str = return_str + `The number of confirmed cases in ${agent.parameters.state[0]} are ${json.latest.confirmed}.`;
                            }
                            break;
                        case "recovered":
                            if (return_str != "") {
                                return_str = return_str + `The number of recovered are ${json.latest.recovered}.`;
                            }
                            else {
                                return_str = return_str + `The number of recovered in ${agent.parameters.state[0]} are ${json.latest.recovered}.`;
                            }
                            break;
                        default:
                            return_str = `I am not sure which stats you are asking for.`;
                            break;
                    }
                    agent.add(return_str);
                    return;
                }
            }
            else {
                console.log("In country results");
                return_str = "";
                for (var j = 0; j < agent.parameters.type.length; j++) {
                    switch (agent.parameters.type[j]) {
                        case "all":
                            return_str = return_str + `The number of deaths in ${agent.parameters.country[0].name} are ${json.latest.deaths}, the number of confirmed cases are ${json.latest.confirmed}, and the number of recovered are ${json.latest.recovered}`;
                            break;
                        case "deaths":
                            if (return_str != "") {
                                return_str = return_str + `The number of deaths are ${json.latest.deaths}.`;
                            }
                            else {
                                return_str = return_str + `The number of deaths in ${agent.parameters.country[0].name} are ${json.latest.deaths}.`;
                            }
                            break;
                        case "confirmed":
                            if (return_str != "") {
                                return_str = return_str + `The number of confirmed cases are ${json.latest.confirmed}.`;
                            }
                            else {
                                return_str = return_str + `The number of confirmed cases in ${agent.parameters.country[0].name} are ${json.latest.confirmed}.`;
                            }
                            break;
                        case "recovered":
                            if (return_str != "") {
                                return_str = return_str + `The number of recovered are ${json.latest.recovered}.`;
                            }
                            else {
                                return_str = return_str + `The number of recovered in ${agent.parameters.country[0].name} are ${json.latest.recovered}.`;
                            }
                            break;
                        default:
                            return_str = `I am not sure which stats you are asking for.`;
                            break;
                    }
                }
                agent.add(return_str);
                return;
            }
        })
            .catch(err => {
                console.log("An error occured receiving JSON" + err);
                agent.add("I'm sorry, an error occured");
                return;
            });
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('Location Stats', location_stats);
    intentMap.set('Worldwide Stats', latest);
    agent.handleRequest(intentMap);
});
