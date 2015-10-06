/**
 * Code Sample submitted from Eddie Hinkle
 * This code is part of an activity database built for U.S. Agency for International Development.
 * The REST API is built as a module inside of Drupal 6. The JavaScript Application is powered by Backbone.js and is written an MVC pattern.
 * Stack used: Drupal 6, Backbone.js, Handlebars.js, Leaflet.js
 * 
 * This file is the MapEditController which represents the controller for a specific page inside of the JavaScript Application
 * which allows a user to edit location information for the activities inside of the application.
 */

var MapEditController = TemplateView.extend({
    className: 'mapEdit',
    saved: false,
    template: 'mapEdit',
    templateContext: function (renderOptions) {
        renderOptions.locations = this.model.map(function (location) {
            return {
                alId: location.get("activityLocationId"),
                defaultLat: location.get("defaultLocation").get("lat").toFixed(6),
                defaultLng: location.get("defaultLocation").get("lng").toFixed(6),
                rname: location.get("rname"),
                mname: location.get("mname"),
                pname: location.get("pname"),
                preciseLat: (location.has("preciseLocation") && location.get("preciseLocation").has("lat") ? location.get("preciseLocation").get("lat").toFixed(6) : undefined),
                preciseLng: (location.has("preciseLocation") && location.get("preciseLocation").has("lng") ? location.get("preciseLocation").get("lng").toFixed(6) : undefined)
            }
        });

        renderOptions.editMode = renderOptions.view.isEditView();
        this.editMode = renderOptions.view.isEditView();
        renderOptions.mapClass = (this.editMode ? 'editmap' : 'viewonlymap');

        this.renderOptions = renderOptions;
        return renderOptions;
    },

    remove: function () {
        // Remove Locations Table
        if (this.table !== undefined) {
            this.table.remove();
        }

        Backbone.View.prototype.remove.call(this);
    },

    postRender: function (renderOptions) {

        this.table = renderOptions.table;

        this.table.render({
            view: this,
            model: this.model,
            isEditView: this.editMode,
            activityNew: renderOptions.activityNew
        });

        this.table.on('location.place.edit.cancel', this.cancelEditActivityLocation, this);
        this.table.on('location.remove.box', this.closeLocationBox, this);

        this.model.store();

        if (this.locationTableIsEmpty()) {
            this.hideLocationTable();
        }

        this.drawLocationsMap();
        this.enableLocationTable();

        this.model.setSaved();
    },


    closeLocationBox: function (seconds, keepConfirmLayer) {
        this.table.removeLocationBox(seconds);

        this.locationsBoxBuilt = false;
        $("#search-places").select2('destroy');
        $("#search-places").remove();
        $("#or-text").remove();
        this.gazarray = undefined;
        this.removeSelect("region", keepConfirmLayer);
        this.removeSelect("municipal", keepConfirmLayer);
        this.removeSelect("place", keepConfirmLayer);
    },

    removeSelect: function (selectName, keepConfirmLayer) {
        $("#" + selectName + "-select").select2("destroy");
        $("#" + selectName + "-select").remove();
        this.resetSelectSettings(selectName, keepConfirmLayer);
    },
    resetSelect: function (selectName, keepConfirmLayer) {
        $("#" + selectName + "-select").val("false");
        this.resetSelectSettings(selectName, keepConfirmLayer);
    },
    resetSelectSettings: function (selectName, keepConfirmLayer) {
        this[selectName + "Name"] = undefined;

        if (selectName == "place") {
            this.selectedGazetteer = undefined;
            if (keepConfirmLayer != true) {
                this.confirmationLayer = undefined;
            }
        }
    },
    resetSearchPlace: function () {
        $("#search-places").select2('val', '');
    },

    showAddLocationOptions: function (editingAlId) {
        this.table.showLocationBox(400, editingAlId);

        if (!this.locationsBoxBuilt) {
            this.gazarray = {admOne: [], admTwo: {}, places: {}, byPcode: {}, byPlace: []};
            this.addPlacenameSearch();
            this.addRegionSelect();
            this.locationsBoxBuilt = true;
        }
    },

    addPlacenameSearch: function () {
        var searchField = $("<input>").attr("id", "search-places").attr("name", "search-places").attr("type", "hidden").attr("placeholder", "Search Places").appendTo("#add-location-from-gazetteer");
        programId = this.renderOptions.programId;

        var orText = $("<div>").attr("id", "or-text").attr("name", "or-text").html("Or").appendTo("#add-location-from-gazetteer");

        var pageLimit = 10;

        searchField.select2({
            placeholder: "Search for a place",
            minimumInputLength: 4,
            ajax: {
                url: function (term, page) {
                    return '?q=activitydb/gazetteer/api/program/' + programId + '/search/' + term;
                },
                dataType: 'json',
                quietMillis: 500,
                data: function (term, page) {
                    return {
                        page_limit: pageLimit,
                        page: page - 1
                    };
                },
                results: function (data, page) {

                    // Get how many pages we've passed
                    var previousPages = (page > 0 ? page - 1 : 0);
                    // Get how many records we've passed
                    var previousRecords = previousPages * pageLimit;
                    // Get how many records we've gotten including current payload
                    var allRecords = previousRecords + data.count;

                    var more = allRecords < data.total;

                    return {results: data.results, more: more};
                }
            },
            allowClear: true,
            formatResult: this.formatPlace,
            formatSelection: function (item) {
                return item.value;
            },
            dropdownCssClass: "placeresults",
            sortResults: function (results, container, query) {
                return results.sort(function (a, b) {
                    return b.score - a.score;
                });
            }
        });

        searchField
            .on("select2-highlight", $.proxy(function (e) {
                this.previewPlace(e.choice);
            }, this))
            .on("select2-removed", $.proxy(function (e) {
                this.clearPreviewPlace();
            }, this))
            .on("select2-close", $.proxy(function () {
                if (searchField.select2("data") === null) {
                    this.clearPreviewPlace();
                }
            }, this))
            .on("select2-selecting", $.proxy(function (e) {
                this.clearPreviewPlace();

                if (e.object === undefined) {
                    var selected = $(e.currentTarget).select2("data");
                } else {
                    var selected = e.object;
                }

                // Check if this is an initial load from activity location edit button
                if (selected.edit) {
                    // Initial load done through being edited
                    var location = this.model.getLocationById(selected.alId);

                    // Set activity location as being edited
                    location.enableEdit("place");
                    location.store();

                } else {

                    // This is user-selected loading, not an auto-load for the edit button

                    // Check if the activity location has already been selected
                    if (this.selectedId === undefined) {
                        // The activity location has not been selected yet

                        // Create Activity Location within this Activity Location List model
                        var location = this.createNewActivityLocationInModel({
                            gazetteerId: selected.id,
                            rname: selected.regionName,
                            mname: selected.municipalName,
                            pname: selected.placeName,
                            mcode: selected.mcode,
                            pcode: selected.pcode,
                            location: {
                                id: selected.location.id,
                                json: selected.location.json
                            }
                        });

                        // Set the Selected Activity Location Id.
                        this.selectedId = location.get("activityLocationId");

                    } else {
                        // The Activity Location is already selected, we just need to update the place

                        // Grab the currently selected Activity Location
                        var location = this.model.getLocationById(this.selectedId);

                        // Update the Place information
                        location.changeGazetteerLocation({
                            gazetteerId: selected.id,
                            rname: selected.regionName,
                            mname: selected.municipalName,
                            pname: selected.placeName,
                            mcode: selected.mcode,
                            pcode: selected.pcode,
                            location: {
                                id: selected.location.id,
                                json: selected.location.json
                            }
                        });

                    }
                }

                // Call to Auto-fill the Gazetteer Drop Down selects
                this.autofillGazetteerOptions();
            }, this));


    },
    createNewActivityLocationInModel: function (gazetteerInfo) {
        // Create a new Activity Location
        var location = new ActivityLocation();

        // Set location as unsaved
        location.setNew();

        // Add the place information
        location.changeGazetteerLocation(gazetteerInfo);

        // Trigger Location Marker as being edited
        location.get("marker").enableEdit();

        // Add Activity Location to Model
        this.model.add(location);

        return location;
    },

    formatPlace: function (place) {
        var compiled_results_template = Handlebars.compile(ActivityDBTemplates.partials.placesSearchResults);

        var placeContext = {
            type: place.type,
            regionName: place.regionName,
            municipalName: place.municipalName,
            placeName: place.value
        }

        var html = compiled_results_template(placeContext);
        return html;
    },

    autofillGazetteerOptions: function () {
        var place = this.model.getLocationById(this.selectedId);

        // Proceed if Region Name is provided
        if (place.has("rname")) {
            $("#region-select").select2("val", place.get("rname")).trigger("change");

            // Proceed if Municipal Name is provided
            if (place.has("mname")) {
                $(document).ajaxComplete($.proxy(function (event, xhr, settings) {
                    if (settings.url.indexOf("activitydb/gazetteer/api/program/") != -1 && settings.url.indexOf("/admin/2/") != -1 && $("#municipal-select").val() == "false") {
                        $("#municipal-select").select2("val", place.get("mname")).trigger("change");
                        $(document).off('ajaxComplete', arguments.callee)
                        // Proceed if Place ID is provided
                        if (place.get("gazetteerId")) {
                            $(document).ajaxComplete($.proxy(function (event, xhr, settings) {
                                if (settings.url.indexOf("activitydb/gazetteer/api/program/") != -1 && settings.url.indexOf("/admin/3/") != -1 && $("#place-select").val() == "false") {
                                    $("#place-select").select2("val", place.get("gazetteerId")).trigger("change");
                                    $(document).off('ajaxComplete', arguments.callee)
                                }
                            }, this));
                        } // end if place id
                    }
                }, this));
            } // end if municipal name
        } // end if region name
    },

    clearPreviewPlace: function () {
        if (this.previewLocation !== undefined) {
            this.map.removeLayer(this.previewLocation.get("marker").toMap());
            this.previewLocation = undefined;
        }

    },

    previewPlace: function (selectedGazetteer) {

        if (this.previewLocation === undefined) {
            this.previewLocation = new ActivityLocation();
        } else {
            this.map.removeLayer(this.previewLocation.get("marker").toMap());
        }

        // Update Gazetteer Location information of place
        this.previewLocation.changeGazetteerLocation({
            gazetteerId: selectedGazetteer.id,
            rname: selectedGazetteer.regionName,
            mname: selectedGazetteer.municipalName,
            pname: selectedGazetteer.placeName,
            mcode: selectedGazetteer.mcode,
            pcode: selectedGazetteer.pcode,
            location: {
                id: selectedGazetteer.location.id,
                json: selectedGazetteer.location.json
            }
        });

        var marker = this.previewLocation.get("marker");
        marker.enableEdit();
        marker.toMap().addTo(this.map);
    },

    getAdminItems: function (settings) {
        var programId = settings.programId || this.renderOptions.programId;
        var adminLevel = settings.adminLevel || 1;
        var adminParent = settings.adminParent || undefined;

        var gazetteer_api_query = Drupal.settings.basePath + 'activitydb/gazetteer/api/program/' + programId + '/admin/' + adminLevel + '/';
        if (adminParent) {
            gazetteer_api_query += adminParent;
        }

        $.getJSON(gazetteer_api_query, $.proxy(function (data) {
            this[settings.callback_function](settings.callback_data, data.results);
            // Need to find a way to pass this data to the functions that need it.
        }, this));
    },

    addRegionSelect: function (regionSelected) {
        this.getAdminItems({
            adminLevel: 1,
            callback_function: 'addRegionOptions',
            callback_data: {'selected': regionSelected}
        });
    },

    addRegionOptions: function (data, options) {
        var selectList = $('<select>').attr("id", "region-select").appendTo('#add-location-from-gazetteer');
        // Add default
        var defaultOption = $('<option>').attr("value", "false").text("Select a region");
        defaultOption.appendTo(selectList);
        // Loop through all options
        $.each(options, function (index, item) {
            if (item != "TBD") {
                var newOption = $('<option>').text(item);
                newOption.appendTo(selectList);
            }
        });
        selectList.change($.proxy(function (evt) {
            this.updatedRegionSelect(evt);
        }, this));
        selectList.select2({
            dropdownCssClass: "regionlisting",
            allowClear: true,
            placeholder: "Select a Region"
        });
    },
    updatedRegionSelect: function (evt) {
        // Get value of select
        var regionName = evt.target.value;
        // Add the next select
        this.updateRegionSelect(regionName);
    },
    updateRegionSelect: function (regionName) {
        this.addMunicipalSelect(regionName);
        // Clear confirmation layer
        this.checkAndClearConfirmLayer();
    },

    addMunicipalSelect: function (regionName, municipalSelected) {
        this.regionName = regionName;
        this.getAdminItems({
            adminLevel: 2,
            adminParent: regionName,
            callback_function: 'addMunicipalOptions',
            callback_data: {'selected': municipalSelected}
        });
    },
    addMunicipalOptions: function (data, options) {
        if ($("#municipal-select").get().length == 0) {
            var selectList = $('<select>').attr("id", "municipal-select").appendTo('#add-location-from-gazetteer');
            // add event handler for when the municipal select is changed
            selectList.change($.proxy(function (evt) {
                this.updatedMunicipalSelect(evt);
            }, this));
            selectList.select2({
                dropdownCssClass: "municipallisting",
                allowClear: true,
                placeholder: "Select a Municipal"
            });
        } else {
            var selectList = $("#municipal-select");
            selectList.empty();
            $("#place-select").select2("destroy");
            $("#place-select").remove();
        }
        // Add default
        if (options.length > 1) {
            var defaultOption = $('<option>').attr("value", "false").text("Select a municipal");
            defaultOption.appendTo(selectList);
            selectList.trigger("change");
        }
        // Loop through all options
        $.each(options, function (index, item) {
            if (item != "TBD") {
                var newOption = $('<option>').text(item);
                newOption.appendTo(selectList);
            }
        });
        if (options.length == 1) {
            selectList.trigger("change");
            this.only_municipal_in_region = true;
        } else {
            this.only_municipal_in_region = false;
        }
    },
    updatedMunicipalSelect: function (evt) {
        // Get value of select
        var municipalName = evt.target.value;

        // Check if municipal isn't selected
        if (municipalName != "false") {
            // Add the next select
            this.updateMunicipalSelect(municipalName);
        }
    },
    updateMunicipalSelect: function (municipalName) {
        this.addPlacesSelect(municipalName);
        // Clear confirmation layer
        this.checkAndClearConfirmLayer();
    },

    addPlacesSelect: function (municipalName, placeSelected) {
        this.municipalName = municipalName;
        this.getAdminItems({
            adminLevel: 3,
            adminParent: municipalName,
            callback_function: 'addPlacesOptions',
            callback_data: {'selected': placeSelected}
        });
    },

    addPlacesOptions: function (data, options) {
        var onlyOption = false;
        this.sameOptionAsMunicipal = false;
        if (options.length == 1) {
            onlyOption = true;
            if (this.municipalName == options[0].placeName) {
                this.sameOptionAsMunicipal = true;
            }
        }
        if (!this.sameOptionAsMunicipal) {
            if ($("#place-select").get().length == 0) {
                var selectList = $('<select>').attr("id", "place-select").appendTo('#add-location-from-gazetteer');
                selectList.change($.proxy(function (evt) {
                    var gazetteer_id = evt.target.value;
                    // Check if a place is selected
                    if (gazetteer_id != "false") {
                        // Get place information
                        this.getPlaceInformation(gazetteer_id, undefined);
                    }
                }, this));
                selectList.select2({
                    dropdownCssClass: "placelisting",
                    allowClear: true,
                    placeholder: "Select a Place"
                });
            } else {
                var selectList = $("#place-select");
                selectList.empty();
            }
            if (!onlyOption) {
                // Add default
                var defaultOption = $('<option>').attr("value", "false").text("Select a Place");
                defaultOption.appendTo(selectList);
                selectList.trigger("change");
            }
            // Loop through all options
            $.each(options, function (index, item) {
                if (item.placeName != "TBD") {
                    var newOption = $('<option>').val(item.gazetteer_id).text(item.pname);
                    newOption.appendTo(selectList);
                }
            });
            if (onlyOption) {
                selectList.trigger("change");
            }
        } else {
            var gazetteer_id = options[0].gazetteer_id;
            this.getPlaceInformation(gazetteer_id, this.sameOptionAsMunicipal);
        }
    },
    checkAndClearConfirmLayer: function () {
        // Check if there is currently a confirmation layer
        if (this.confirmationLayer !== undefined) {
            // Get the number of confirmation layers
            var numConfirms = this.confirmationLayer.getLayers().length;
            if (numConfirms > 0) {
                this.confirmationLayer.clearLayers();
                this.map.removeLayer(this.confirmationLayer)
                this.confirmationLayer == undefined;
            }
        }
    },

    getPlaceInformation: function (gazetteer_id, notDiscreteLocation) {

        if (this.selectedId !== undefined) {
            // Get current place
            var place = this.model.getLocationById(this.selectedId);

            // Get Place Gazetteer Id and add to a variable
            var placeGazetteerId = place.get("gazetteerId");
        }

        // Check if the selected place matches the existing selected gazetteer
        if (placeGazetteerId != gazetteer_id) {

            // Create Gazetteer API link
            gazetteer_api_query = Drupal.settings.basePath + 'activitydb/gazetteer/api/gazetteer/' + gazetteer_id + '/';

            // Fetch Gazetteer Data
            $.getJSON(gazetteer_api_query, $.proxy(function (data) {
                this.addPlaceConfirmation(data.results);
            }, this));

        } else {
            // Places was auto-selected from searh places. This means we already have the data
            this.addPlaceConfirmation(undefined, true);
        }

    },

    addPlaceConfirmation: function (selectedGazetteer, skipData) {

        if (skipData === undefined && selectedGazetteer.error !== undefined) {
            var error = $('<div>').addClass("alert alert-danger fade in").prependTo($('#add-location-from-gazetteer'));
            $('<button>').addClass('close').attr('data-dismiss', 'alert').attr('aria-hidden', 'true').text('x').appendTo(error);
            $('<span>').text("Error: " + selectedGazetteer.error).appendTo(error);
        } else {

            // Check if we have an existing activity location object
            if (this.selectedId !== undefined) {
                // Get activity location object from model
                var place = this.model.getLocationById(this.selectedId);

                // Check if there is data to add
                if (selectedGazetteer !== undefined) {
                    // Update Gazetteer Location information of place
                    place.changeGazetteerLocation({
                        gazetteerId: selectedGazetteer.id,
                        rname: selectedGazetteer.regionName,
                        mname: selectedGazetteer.municipalName,
                        pname: selectedGazetteer.placeName,
                        mcode: selectedGazetteer.mcode,
                        pcode: selectedGazetteer.pcode,
                        location: {
                            id: selectedGazetteer.location.id,
                            json: selectedGazetteer.location.json
                        }
                    });
                }

            } else {

                // Create Activity Location within this Activity Location List model
                var place = this.createNewActivityLocationInModel({
                    gazetteerId: selectedGazetteer.id,
                    rname: selectedGazetteer.regionName,
                    mname: selectedGazetteer.municipalName,
                    pname: selectedGazetteer.placeName,
                    mcode: selectedGazetteer.mcode,
                    pcode: selectedGazetteer.pcode,
                    location: {
                        id: selectedGazetteer.location.id,
                        json: selectedGazetteer.location.json
                    }
                });

                // Set the Selected Activity Location Id.
                this.selectedId = place.get("activityLocationId");
            }

            // Get The Last Stored Gazetteer Entry
            var lastStoredGazetteer = place.checkLast();

            // Check if there is a precise location and that the marker has changed
            if (place.displayLocationType() == "preciseLocation" && lastStoredGazetteer.gazetteerId != place.get("gazetteerId")) {
                // Update marker using the default location
                place.updateMarker(true);
            }

            // Get Map Marker
            var marker = place.get("marker");

            // Check if there is an existing marker
            if (this.activitiesLayer !== undefined && this.activitiesLayer.hasLayer(marker.toMap())) {
                // remove marker from activities layer
                this.activitiesLayer.removeLayer(marker.toMap());
            }

            // Ensure Confirmation Layer is Clear
            this.checkAndClearConfirmLayer();

            // Create Confirmation Layer and add to map
            this.confirmationLayer = new L.geoJson([]);
            this.confirmationLayer.addTo(this.map);

            // Set Marker as Edit Mode
            marker.enableEdit();

            // Add Marker to the Confirmation Layer
            this.confirmationLayer.addLayer(marker.toMap());

            // Get The Last Stored Gazetteer Entry
            var lastStoredGazetteer = place.checkLast();

            // Check if the gazetteer is the original gazetteer
            if (lastStoredGazetteer === undefined || lastStoredGazetteer.gazetteerId != place.get("gazetteerId")) {
                // Since Marker has changed, run confirmation message
                this.runConfirmationMessage();
            }

        }
    },

    runConfirmationMessage: function (selectedGazetteer, evt) {

        var marker = this.model.getMarkerById(this.selectedId);
        var mapMarker = marker.toMap();

        mapMarker.on("popupopen", function () {
            $(".locationConfirm .optionOne").on("click", $.proxy(function () {
                this.locationConfirmed();
                $(".locationConfirm input").off();
            }, this));
            $(".locationConfirm .optionTwo").on("click", $.proxy(function () {
                this.locationDenied();
                $(".locationConfirm input").off();
            }, this));
        }, this);

        // Compile Confirmation Template
        var compiled_results_template = Handlebars.compile(ActivityDBTemplates.partials.confirmationPopup);

        // Render template
        var html = compiled_results_template({
            message: "Is this correct?",
            optionOne: "Yes",
            optionTwo: "No",
            specialClass: "locationConfirm",
            buttonClass: "edit"
        });

        mapMarker.bindPopup(html, {'closeButton': false});
        mapMarker.openPopup();
    },
    locationDenied: function () {

        var keepConfirmLayer;

        // Get the currently selected place object
        var place = this.model.getLocationById(this.selectedId);

        // Check if this is a place object being edited
        if (!place.isNew()) {
            // Set to keep the confirmation layer
            keepConfirmLayer = true;
        }

        // Clear all layers on confirmation layer
        this.confirmationLayer.clearLayers();

        // Reset Search Place Field
        this.resetSearchPlace();

        // Check if the Place is the same as the Municipal
        if (this.sameOptionAsMunicipal) {
            // Check if there is only one municipal inside the region
            if (this.only_municipal_in_region) {
                // Since there is only one municipal, remove that field
                this.removeSelect("municipal", keepConfirmLayer);
                // Reset the region field
                this.resetSelect("region", keepConfirmLayer);
            } else {
                // Reset the municipal since there is more than one municipal in the region
                this.resetSelect("municipal", keepConfirmLayer);
            }
            // Remove the place since it is the same as the municipal
            this.removeSelect("place", keepConfirmLayer);
        } else {
            // Reset the place so it can be used
            this.resetSelect("place", keepConfirmLayer);
        }

        // Check if this place is being edited
        if (!place.isNew()) {
            // Reset place to last place
            place.restore();
            // Store again in case we need to reset again
            place.store();

            // Call to Auto-fill to reset back to the original place
            this.autofillGazetteerOptions();

            place.get("marker").moveMarker(place.displayLocation().getLatLng());
        }

        $('#add-location-from-gazetteer').animateBackgroundHighlight('#e07847', 400);

    },
    locationConfirmed: function () {

        var place = this.model.getLocationById(this.selectedId);

        if (place.isNew()) {
            // If it's new, take us to adding a precise Location
            place.set("preciseAction", "adding");
            this.addPreciseLocation();

        } else {

            // Check if we need to revert the marker to a precise location marker
            if (place.displayLocationType() == "preciseLocation") {
                // Revert to a precise marker
                place.revertMarker();
            }

            // Confirm Location Creation
            this.completeLocationCreation();
        }
    },

    addPreciseLocation: function () {

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(this.selectedId);

        // Get Activity Marker
        var marker = location.get("marker");
        var mapMarker = marker.toMap();

        // Set the map view to be zoomed into the current precise location
        var markerLocation = marker.getLatLng();
        this.map.setView(markerLocation, this.defaultZoom + 6, {
            animate: true
        });

        // Check if we are creating a new activity location or editing one
        if (location.isNew()) {
            // We are creating a new activity, so close the add location box
            this.closeLocationBox(400, true);

        } else {
            // We are editing an existing activity location

            // Create Confirmation Layer and add to map
            this.confirmationLayer = new L.geoJson([]);
            this.confirmationLayer.addTo(this.map);

            // Set the marker to edit mode
            marker.enableEdit();

            // Disable Bounce
            marker.disableBounce();

            // Add Marker to the Confirmation Layer
            this.confirmationLayer.addLayer(mapMarker);

        }

        marker.set("type", "precise");

        var compile_options = {
            message: "Add Precise Location by",
            optionOne: "Drag Marker",
            optionTwo: "Enter Coordinates",
            specialClass: "preciseOptions",
            buttonClass: "edit"
        }

        // Compile Confirmation Template
        if (location.isNew()) {
            var compiled_results_template = Handlebars.compile(ActivityDBTemplates.partials.threeOptionPopup);
            compile_options.optionThree = "Skip a precise location";
        } else {
            var compiled_results_template = Handlebars.compile(ActivityDBTemplates.partials.confirmationPopup);
        }

        // Render template
        var html = compiled_results_template(compile_options);

        // Attach rendered html to window
        mapMarker.bindPopup(html, {'closeButton': false});

        // Set up Map Pop Up
        mapMarker.on("popupopen", function () {
            $(".preciseOptions .optionOne").on("click", $.proxy(function () {
                this.dragMarkerForPrecise();
                $(".preciseOptions input").off();
            }, this));
            $(".preciseOptions .optionTwo").on("click", $.proxy(function () {
                if (location.displayLocationType() == "preciseLocation") {
                    this.enterCoordinatesForPrecise(location.displayLocation().getLatLng());
                } else {
                    this.enterCoordinatesForPrecise();
                }
                $(".preciseOptions input").off();
            }, this));
            if (location.isNew()) {
                $(".preciseOptions .optionThree").on("click", $.proxy(function () {
                    this.completeLocationCreation();
                    $(".preciseOptions input").off();
                }, this));
            }
        }, this);

        // Open pop up
        mapMarker.openPopup();

    },

    prepareMarkerForDragging: function (mapMarker) {
        mapMarker.dragging.enable();
        alId = mapMarker.feature.properties.activityLocationId;
        var marker = this.model.getMarkerById(alId);
        if (marker.get("type") == "precise") {
            mapMarker.on("move", $.proxy(this.updatePreciseMarkerLocation, this));
        }
    },
    unprepareMarkerForDragging: function (marker) {

    },
    updatePreciseMarkerLocation: function (evt) {
        // Get the activity location Id
        var alId = evt.target.feature.properties.activityLocationId;

        // Get the new latitude and longitude
        var loc = evt.latlng;

        // Set the new latitude and longitude
        $(".locationsTableView .table tr#" + alId + " .precise_location").data("lat", loc.lat.toFixed(6)).data("lng", loc.lng.toFixed(6));

    },

    dragMarkerForPrecise: function () {

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(this.selectedId);

        // Get Activity Marker
        var marker = location.get("marker");
        var mapMarker = marker.toMap();

        // Prepare Marker for Dragging and Enable
        this.prepareMarkerForDragging(mapMarker);

        // Create and Show Popup For Marker
        mapMarker.bindPopup("Drag this icon to the precise location of your activity.", {'closeButton': false});
        mapMarker.openPopup();
        mapMarker._popup.name = "drag";

        // Set up interaction events for marker
        mapMarker.on("dragstart", this.activityDraggingStarted, this);
        mapMarker.on("dragend", this.activityDraggingStopped, this);

    },

    savePreciseMarkerLocation: function () {

        // Get the location object that is currently selected
        var location = this.model.getLocationById(this.selectedId);

        // Check if we are creating a new location
        if (location.isNew()) {
            // Create a new precise location
            var mapMarker = location.get("marker").toMap();
            var geojson = mapMarker.toGeoJSON();
            var preciseLocation = new Location(geojson);
            location.set("preciseLocation", preciseLocation);

            // Create standard added button
            var compiled_button = Handlebars.compile(ActivityDBTemplates.partials.locationTablePreciseLocationExists);
            var added_button = compiled_button({loc: {alId: this.selectedId}});

            var activityRow = $("tr#" + this.selectedId);
            activityRow.removeClass("no-precise");
            activityRow.addClass("precise-exists");
            activityRow.data("precise", "true");

            this.completeLocationCreation();
        } else {
            // We are editing a location
            var alId = this.selectedId;
            var mapMarker = location.get("marker").toMap();
            if (!location.has("preciseLocation")) {
                // We are specifying a new precise location inside of an existing activity
                var geojson = mapMarker.toGeoJSON();
                var preciseLocation = new Location(geojson);
                location.set("preciseLocation", preciseLocation);

                // Create standard added button
                var compiled_button = Handlebars.compile(ActivityDBTemplates.partials.locationTablePreciseLocationExists);
                var added_button = compiled_button({loc: {alId: this.selectedId}});

                var activityRow = $("tr#" + this.selectedId);
                activityRow.removeClass("no-precise");
                activityRow.addClass("precise-exists");
                activityRow.data("precise", "true");
                activityRow.find(".precise_location").data("lat", geojson.geometry.coordinates[1]);
                activityRow.find(".precise_location").data("lng", geojson.geometry.coordinates[0]);
                activityRow.find(".precise_location").html(added_button);
                this.table.attachPreciseCoordinatesPopover(activityRow.find(".precise_location"));

            } else {
                // We are editing an existing precise location inside of an existing activity
                var latlng = mapMarker.getLatLng();
                var preciseLocation = location.get("preciseLocation");
                preciseLocation.set("lat", latlng.lat);
                preciseLocation.set("lng", latlng.lng);

                // Update Popover of Coordinates
                var activityRow = $("tr#" + this.selectedId);
                activityRow.find(".precise_location").data("lat", latlng.lat);
                activityRow.find(".precise_location").data("lng", latlng.lng);
                activityRow.find(".precise_location").popover('destroy');
                this.table.attachPreciseCoordinatesPopover(activityRow.find(".precise_location"));

            }
            this.activityAdded(alId);
        }

    },

    validatePreciseLocation: function (lat, lng) {

        // Get the location of the activity we're validating
        var location = this.model.getLocationById(this.selectedId);
        var defaultLoc = location.get("defaultLocation").getLatLng();

        // Set Validation Status
        var validate = {
            status: true,
            message: undefined
        }

        lat = parseFloat(lat);
        lng = parseFloat(lng);

        if (validate.status && (isNaN(lat) || isNaN(lng))) {
            validate.status = false;
            validate.message = "You must enter a real latitude and longitude.";
        }

        // Set up Latitude and Longitude
        lat = lat.toFixed(6);
        lng = lng.toFixed(6);

        // Get the last two digits of the number
        lastOfLat = lat.toString().slice(-2);
        lastOfLng = lng.toString().slice(-2);

        if (validate.status && lastOfLat == "00") {
            validate.status = false;
            validate.message = "Latitude needs to have 6 real numbers after the decimal";
        }

        if (validate.status && lastOfLng == "00") {
            validate.status = false;
            validate.message = "Longitude needs to have 6 real numbers after the decimal";
        }

        // Set stored lat and lng to 6 decimal places
        defaultLat = defaultLoc.lat.toFixed(6);
        defaultLng = defaultLoc.lng.toFixed(6);

        if (validate.status && lat == defaultLat && lng == defaultLng) {
            validate.status = false;
            validate.message = "You can't set the precise location to be the same as the place";
        }

        return validate;

    },

    enterCoordinatesForPrecise: function (coordinatesDefault, errorMsg) {

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(this.selectedId);

        // Get Activity Marker
        var marker = location.get("marker");
        var mapMarker = marker.toMap();

        // Ask For Coordinates
        mapMarker.once("popupopen", function () {
            $("#view-location").on("click", $.proxy(function () {
                var validate = this.validatePreciseLocation($('#xCoordinate').val(), $('#yCoordinate').val());
                if (validate.status) {
                    this.confirmPreciseCoordinates({
                        lat: $('#xCoordinate').val(),
                        lng: $('#yCoordinate').val()
                    });
                    $('#xCoordinate').remove();
                    $('#yCoordinate').remove();
                } else {
                    this.enterCoordinatesForPrecise(undefined, validate.message);
                }
            }, this));
        }, this);

        if (coordinatesDefault !== undefined) {
            var lat = coordinatesDefault.lat;
            var lng = coordinatesDefault.lng;
        } else {
            var lat = "";
            var lng = "";
        }
        mapMarker.unbindPopup();

        var htmlPopup = "";

        if (errorMsg !== undefined) {
            htmlPopup += "<div class='error'>" + errorMsg + "</div>";
        }

        htmlPopup += "<div class='confirmationMessage unselectableText enterCoordinates'>Enter Coordinates</div><input id='xCoordinate' type='text' placeholder='Latitude' value='" + lat + "'><input id='yCoordinate' type='text' placeholder='Longitude' value='" + lng + "'><div id='view-location' class='defaultButton edit unselectableText'>View Location</div>";

        mapMarker.bindPopup(htmlPopup, {'closeButton': false});

        mapMarker.openPopup();

    },

    confirmPreciseCoordinates: function (newCoordinates) {

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(this.selectedId);

        // Get Activity Marker
        var marker = location.get("marker");
        var mapMarker = marker.toMap();

        // Set up an event listener to update the marker location
        mapMarker.on("move", $.proxy(this.updatePreciseMarkerLocation, this));
        mapMarker.setLatLng(L.latLng(newCoordinates.lat, newCoordinates.lng));

        // Prepare Popup
        mapMarker.once("popupopen", function () {
            $("#confirmLocationBtn").on("click", $.proxy(function () {
                this.savePreciseMarkerLocation();
            }, this));
            $("#denyLocationBtn").on("click", $.proxy(function () {
                this.enterCoordinatesForPrecise(newCoordinates);
            }, this));
        }, this);
        mapMarker.unbindPopup();
        mapMarker.bindPopup("<div class='confirmationMessage unselectableText' style='width: 200px;'>Is this correct?</div><input id='confirmLocationBtn' class='defaultButton edit' type='submit' value='Yes'><input id='denyLocationBtn' class='defaultButton edit'  type='submit' value='No'><br style='clear: both;'>", {'closeButton': false});
        mapMarker.openPopup();

    },

    completeLocationCreation: function () {

        // Get current location
        var place = this.model.getLocationById(this.selectedId);

        // Clear Confirmation Layer    
        this.confirmationLayer.clearLayers();

        // Close Location Box
        this.closeLocationBox(400);

        // Disable Editing on Location
        place.get("marker").disableEdit();

        this.map.setView([this.centerX, this.centerY], this.defaultZoom, {
            animate: true
        });

        // Add Location
        this.addActivityLocation(place);
    },

    addActivityLocationsToMap: function (locationData) {
        var deferred = $.Deferred();

        // Check if activities layer exists
        if (this.activitiesLayer === undefined) {

            if ((typeof locationData !== "string") && (locationData.length === undefined)) {
                var mapMarker = locationData.get("marker").toMap();
                locationData = [];
            }

            this.activitiesLayer = new L.geoJson(locationData, {
                // TODO: Probably take these functions and seperate them from this function, so this function can just be passed markers
                // Run these functions for every geojson element added to this layer
                pointToLayer: $.proxy(function (data, point) {
                    var alId = data.properties.activityLocationId;

                    var actLoc = this.model.getLocationById(alId);

                    // Create marker for activity location
                    var marker = L.marker(point, {
                        icon: L.mapbox.marker.icon({'marker-color': '0075ad'}),
                        bounceOnAdd: true,
                        bounceOnAddOptions: {duration: 500, height: 100}
                    });

                    var activityMarker = new ActivityMarker();
                    activityMarker.set("marker", marker);

                    actLoc.set("marker", activityMarker);
                    actLoc.store();

                    return activityMarker.get("marker");

                }, this),
                onEachFeature: $.proxy(function (feature, layer) {
                    this.linkActivityToTable(layer);
                }, this)
            });
            this.activitiesLayer.addTo(this.map);

            if (mapMarker !== undefined) {
                this.activitiesLayer.addLayer(mapMarker);
                this.linkActivityToTable(mapMarker);
            }
        }
        // Activities layer already exists
        else {
            if (typeof locationData === "string") {
                this.activitiesLayer.addData(locationData);
            } else {
                var mapMarker = locationData.get("marker").toMap();
                this.activitiesLayer.addLayer(mapMarker);
                this.linkActivityToTable(mapMarker);
            }
        }

        deferred.resolve("Done");

        return deferred.promise();
    },

    enableLocationTable: function () {
        $(".locationsTableView .table .defaultButton").on("click", $.proxy(this.activityButtonClicked, this));
        $(".locationsTableView .table tbody tr").on("mouseenter", $.proxy(this.activityRowHover, this));
        $(".locationsTableView .table tbody tr").on("mouseleave", $.proxy(this.activityRowLeave, this));
    },

    enableLocationTableButtons: function () {
        $(".locationsTableView .table .defaultButton").on("click", $.proxy(this.activityButtonClicked, this));
    },

    disableLocationTableButtons: function () {
        $(".locationsTableView .table .defaultButton").off("click", $.proxy(this.activityButtonClicked, this));
    },

    activityRowHover: function (evt) {

        // Get Activity Location Id
        var alId = $(evt.currentTarget).attr('id');

        // Get Marker and Info from Model
        var markerInfo = this.model.getMarkerById(alId);

        // Highlight Marker
        markerInfo.highlight();

        // TODO: Is there a way to have this happen when initially edited?
        // Check if marker is in edit mode
        if (markerInfo.get("edit")) {
            // Add Edit Class
            $('tr#' + alId).addClass('edit');
        }

        // Add class to signify that activity location row is selected
        $('tr#' + alId).addClass('selected');
    },

    activityRowLeave: function (evt) {

        // Get Activity Location Id
        var alId = $(evt.currentTarget).attr('id');

        // Get Marker and Info from Model
        var markerInfo = this.model.getMarkerById(alId);

        // Highlight Marker
        markerInfo.unhighlight();

        // TODO: Is there a way to have this happen when initially edited?
        // Check if marker is in edit mode
        if (markerInfo.get("edit") === undefined) {
            // Add Edit Class
            $('tr#' + alId).removeClass('edit');
        }

        // Remove the selected class from the table row
        $('tr#' + alId).removeClass('selected');
    },

    chooseLocationType: function (action, alId) {
        $('tr#' + alId + ' .region, tr#' + alId + ' .municipal, tr#' + alId + ' .place, tr#' + alId + ' .precise_location, tr#' + alId + ' .location_action > button').addClass('blur');
        $('tr#' + alId + ' .' + action + '_actions').show();

        var buttons = $('tr#' + alId + ' .location_action .' + action + '_actions button');
        buttons.data("locId", alId);
        buttons.data("second-action", action);
    },

    closeChooseLocationType: function (action, alId) {
        $('tr#' + alId + ' .' + action + '_actions').hide();
        $('tr#' + alId + ' .region, tr#' + alId + ' .municipal, tr#' + alId + ' .place, tr#' + alId + ' .precise_location, tr#' + alId + ' .location_action > button').removeClass('blur');

        var buttons = $('tr#' + alId + ' .location_action .' + action + '_actions button');
        buttons.data("locId", alId);
        buttons.data("second-action", undefined);
    },

    activityButtonClicked: function (evt) {
        var button = $(evt.currentTarget);
        var alId = button.data('locId');
        var actionType;
        var action = button.data('second-action');
        if (action === undefined) {
            action = button.data('action');
        } else {
            actionType = button.data('action');
        }

        switch (action) {
            case 'edit':
            case 'remove':
            case 'cancel':
                // Check if this location is missing a precise location
                if ($("tr#" + alId).data("precise") === false) {
                    // Since it doesn't have a precise location, automatically run the action on place
                    actionType = "place";
                }

                if (actionType === undefined) {
                    this.chooseLocationType(action, alId);
                } else {
                    switch (action + "-" + actionType) {
                        case 'edit-place':
                            if (this.selectedId === undefined) {
                                this.editActivityLocation(alId);
                            }
                            break;
                        case 'edit-precise':
                            if (this.selectedId === undefined) {
                                this.editActivityPreciseLocation(alId);
                            }
                            break;
                        case 'remove-place':
                            if (this.selectedId === undefined) {
                                this.removeActivityLocation(alId);
                            }
                            break;
                        case 'remove-precise':
                            if (this.selectedId === undefined) {
                                this.removeActivityPreciseLocation(alId);
                            }
                            break;
                    }
                    this.closeChooseLocationType(action, alId);
                }
                break;
            case 'cancel-default':
                this.cancelEditActivityLocation(alId);
                break;
            case 'add-precise':
                if (this.selectedId === undefined) {
                    this.addActivityPreciseLocation(alId);
                }
                break;
            case 'cancel-precise':
                this.cancelEditPreciseLocation(alId);
                break;
        }
    },

    getLocationFromGazetteer: function (selectedGazetteer) {
        var selectedGazetteerLocation = selectedGazetteer.location;
        var selectedLocation = JSON.parse(selectedGazetteerLocation.json);
        return selectedLocation;
    },

    addActivityLocation: function (location) {

        var addToMap = this.addActivityLocationsToMap(location);
        var addToTable = this.addActivityLocationToTable(location);

        $.when(addToMap, addToTable).done($.proxy(function () {
            this.activityAdded(location.get('activityLocationId'));
        }, this));

    },

    activityAdded: function (alId) {

        var place = this.model.getLocationById(alId);
        var placeName = place.get("pname");

        if (place.isNew()) {
            var saveMessage = placeName + " added!";
        }

        // Check if we were editing a place entry
        if (place.editingPlace()) {
            this.completeEditActivityLocation(alId);
            var saveMessage = placeName + "'s place successfully edited!";
        }

        // Check if we were editing a precise location
        if (place.editingPreciseLocation()) {
            var preciseAction = place.get("preciseAction");
            this.editActivityPreciseLocation(alId);
            if (preciseAction == "adding") {
                var saveMessage = placeName + "'s precise location added!";
            } else {
                var saveMessage = placeName + "'s precise location successfully edited!";
            }
        }

        // Disable Editing
        place.unset("edit");

        // Store the new location
        place.store();

        // Un-select Id
        this.selectedId = undefined;

        // Save Changes
        this.saveLocations(saveMessage, "Success");

    },

    addActivityLocationToTable: function (location) {
        var deferred = $.Deferred();

        // Assign Location Row's Context Variables
        var rowContext = {
            editMode: this.editMode,
            loc: {
                alId: location.get('activityLocationId'),
                rname: location.get('rname'),
                mname: location.get('mname'),
                pname: location.get('pname'),
                defaultLat: location.get('defaultLocation').get('lat').toFixed(6),
                defaultLng: location.get('defaultLocation').get('lng').toFixed(6)
            }
        }

        if (location.displayLocationType() == "preciseLocation") {
            rowContext.loc.preciseLat = location.get('preciseLocation').get('lat').toFixed(6);
            rowContext.loc.preciseLng = location.get('preciseLocation').get('lng').toFixed(6);
        } else {
            rowContext.loc.preciseLat = undefined;
            rowContext.loc.preciseLng = undefined;
        }

        // Set Activity Location Id
        var alId = location.get('activityLocationId');

        if (location.get('edit')) {
            // Update Row because it does exist

            // Get current row
            var activityRow = $("tr#" + alId);

            // Check if the gazetteer place changed
            if (location.editingPlace()) {
                activityRow.find(".region").html(rowContext.loc.rname);
                activityRow.find(".municipal").html(rowContext.loc.mname);
                activityRow.find(".place").html(rowContext.loc.pname);
                activityRow.data("lat", rowContext.loc.defaultLat);
                activityRow.data("lng", rowContext.loc.defaultLng);
            }

            if (location.editingPreciseLocation()) {
                activityRow.find(".precise_location").data("lat", rowContext.loc.preciseLat);
                activityRow.find(".precise_location").data("lng", rowContext.loc.preciseLng);
                activityRow.find(".precise_location").html('<div class="defaultButton approved"><i class="icon-ok icon-white"></i> Precise Location Added</div>');
            }

        } else {
            // Create Row because it doesn't exist

            // Compile and Render Template
            var compiled_row = Handlebars.compile(ActivityDBTemplates.partials.locationTableRow);
            var activityRow = compiled_row(rowContext);

            // Add Template to Table
            $('.locationsTableView .table tbody').append(activityRow);

            // Activate Functionality of all Location Row's buttons
            $(activityRow).find("input, button").on("click", $.proxy(this.activityButtonClicked, this));

            // Activate Hover Effects
            $(".locationsTableView tr#" + alId).on("mouseenter", $.proxy(this.activityRowHover, this));
            $(".locationsTableView tr#" + alId).on("mouseleave", $.proxy(this.activityRowLeave, this));

            // check if there is only one new added row
            if ($('.locationsTableView .table tbody tr').get().length == 1) {
                // show new table
                this.showLocationTable();
            }
        }

        deferred.resolve("done");

        return deferred.promise();
    },

    editActivityLocation: function (alId) {
        this.showAddLocationOptions(alId);
        var location = this.model.getLocationById(alId);
        var markerInfo = location.get("marker");

        // Disable Bounce
        markerInfo.disableBounce();

        $("#edit-" + alId).addClass("edit").html("Cancel").data("action", "cancel-default");

        // Watch for completed AJAX calls
        $(document).ajaxComplete($.proxy(function (event, xhr, settings) {
            // Check if AJAX call was for a list of Admin 1
            if (settings.url.indexOf("activitydb/gazetteer/api/program/") != -1 && settings.url.indexOf("/admin/1/") != -1 && $("#region-select").val() == "false") {

                // Show selected id
                this.selectedId = alId;

                $("#search-places").select2("data", {
                    id: location.get("gazetteerId"),
                    value: location.get("pname"),
                    edit: true,
                    alId: location.get('activityLocationId')
                });

                $("#search-places").trigger("select2-selecting");

                $('html, body').animate({
                    scrollTop: 60
                }, 500);

                setTimeout(function () {
                    $('#add-location-from-gazetteer').animateBackgroundHighlight('#e07847', 750);
                }, 100);

            }
        }, this));

    },

    completeEditActivityLocation: function (alId) {
        $("#edit-" + alId).removeClass("edit").html("Edit").data("action", "edit");
    },

    cancelEditActivityLocation: function (alId) {

        // Remove Edit Class from Table Row
        $("#edit-" + alId).removeClass("edit").html("Edit").data("action", "edit");

        // Get Currently Selected Place
        var place = this.model.getLocationById(this.selectedId);

        // Close any open popups
        this.map.closePopup();

        // Clear Confirmation Layer
        this.confirmationLayer.clearLayers();

        // Get The Last Stored Gazetteer Entry
        var lastStoredGazetteer = place.checkLast();

        // Check if it's the same gazetteer it's always been
        if (lastStoredGazetteer.gazetteerId != place.get("gazetteerId")) {
            // Reset place to last place
            place.restore();
        }

        // Cancel Edit mode of Selected Place's Marker
        place.get("marker").disableEdit();

        // Add Existing Marker back to Activities Layer
        this.activitiesLayer.addLayer(place.get("marker").toMap());

        // Close Add Location Box
        this.closeLocationBox();

        // Cancel Selected Place
        this.selectedId = undefined;
        place.unset("edit");
    },

    removeActivityLocation: function (alId) {

        this.showYesNoMessageDlgBox("Are you sure you want to delete this location?", $.proxy(function () {
            this.dialogResponseYes();

            // Get location of item to remove
            var location = this.model.getLocationById(alId);
            var locationName = location.get("pname");
            var mapMarker = location.get("marker").toMap();

            // Remove location from Map
            this.activitiesLayer.removeLayer(mapMarker);

            // Remove location row from Table
            $('tr#' + alId).remove();

            // Remove location from model
            this.model.remove(location);

            //check if any more rows remain. if not, remove them.
            if (this.locationTableIsEmpty()) {
                this.hideLocationTable();
            }

            // Save Changes
            this.saveLocations("Removed " + locationName, "Deleted");

        }, this));

    },

    locationTableIsEmpty: function () {
        return ($('.locationsTableView .table tbody tr').get().length == 0);
    },

    showLocationTable: function () {
        $('.locationsTableView').show();
    },

    hideLocationTable: function () {
        $('.locationsTableView').hide();
    },

    addActivityPreciseLocation: function (markerId) {
        this.editActivityPreciseLocation(markerId, true);
    },

    editActivityPreciseLocation: function (alId, addingPrecise) {

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(alId);

        var marker = location.get("marker");

        // Check if this location is currently being edited
        if (location.get("edit")) {
            // Location is currently being edited, which means we need to disable editing
            location.disableEdit();

            // Remove the edit from the table row
            $('tr#' + alId).removeClass('edit');

            // Link the activity marker to the table row
            this.linkActivityToTable(marker.toMap());

            // Clear the confirmation layer
            if (this.confirmationLayer !== undefined) {
                this.confirmationLayer.clearLayers();
            }

            // Change Color back to standard
            marker.disableEdit();

            // Unbind Popups
            marker.toMap().unbindPopup();

            // Add layer back to the activities layer
            this.activitiesLayer.addLayer(marker.toMap());

            // Revert Cancel button back to an Edit button
            $("#edit-" + alId).removeClass("edit").html("Edit").data("action", "edit");

            // Unselect this location
            this.selectedId = undefined;

            // Set the map view to zoom back out to full country view
            this.map.setView([this.centerX, this.centerY], this.defaultZoom, {
                animate: true
            });

        } else {
            // Location is not currently being edited

            // We need to enable editing
            location.enableEdit("precise");

            if (addingPrecise) {
                location.set("preciseAction", "adding");
            } else {
                location.set("preciseAction", "editing");
            }

            // Turn the Edit button into a Cancel button
            $("#edit-" + alId).addClass("edit").html("Cancel").data("action", "cancel-precise");

            // Remove link between the activity marker and the table row while editing
            this.unlinkActivityToTable(marker.toMap());

            // Add Edit Mode to the Table Row
            $('tr#' + alId).addClass('edit');

            // Add Activity Location to be the selected location
            this.selectedId = alId;

            // Remove the current activity marker from the activities layer
            this.activitiesLayer.removeLayer(marker.toMap());

            // Begin Add Precise Location
            this.addPreciseLocation();

        }

    },

    cancelEditPreciseLocation: function (alId) {

        this.map.closePopup();

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(alId);

        var last = location.checkLast();

        // Get correct marker
        var marker = location.get("marker");

        if (location.displayLocationType() == "preciseLocation") {
            var displayLoc = location.get('preciseLocation');
            var latlng = displayLoc.getLatLng();
        } else {
            var defaultLoc = location.get('defaultLocation');
            var latlng = defaultLoc.getLatLng();
        }

        // Revert marker location
        marker.moveMarker(latlng);

        // Location is currently being edited, which means we need to disable editing
        location.disableEdit();

        // Remove the edit from the table row
        $('tr#' + alId).removeClass('edit');

        // Link the activity marker to the table row
        this.linkActivityToTable(marker.toMap());

        // Clear the confirmation layer
        this.confirmationLayer.clearLayers();

        // Change Color back to standard
        marker.disableEdit();

        // Unbind Popups
        marker.toMap().unbindPopup();

        // Add layer back to the activities layer
        this.activitiesLayer.addLayer(marker.toMap());

        // Revert Cancel button back to an Edit button
        $("#edit-" + alId).removeClass("edit").html("Edit").data("action", "edit");

        // Unselect this location
        this.selectedId = undefined;

        // Set the map view to zoom back out to full country view
        this.map.setView([this.centerX, this.centerY], this.defaultZoom, {
            animate: true
        });

    },

    removeActivityPreciseLocation: function (alId) {

        var location = this.model.getLocationById(alId);

        this.showYesNoMessageDlgBox("Are you sure you want to remove the precise location? If you do, it will revert to using the standard location for " + location.get("pname"), $.proxy(function () {
            this.dialogResponseYes();

            var marker = location.get("marker");
            var locationName = location.get("pname");

            // Remove the Precise Location from Model
            location.unset("preciseLocation");

            // Move the Marker to the new display location (which should be the default location)
            marker.moveMarker(location.displayLocation().getLatLng());

            var removePreciseButton = $('<button>').addClass('defaultButton').attr('data-loc-id', alId).attr('data-action', 'add-precise').attr('id', 'add-precise-' + alId).html('<i class="icon-plus icon-white"></i> Specify Precise Location');
            $(removePreciseButton).on("click", $.proxy(this.activityButtonClicked, this));

            $("tr#" + alId + " .precise_location").html(removePreciseButton);
            $("tr#" + alId).removeClass("precise-exists");
            $("tr#" + alId).addClass("no-precise");
            $("tr#" + alId).data("precise", "false");
            $("tr#" + alId + " .precise_location").popover('destroy');

            // Save Changes
            this.saveLocations("Removed Precise Location for " + locationName, "Deleted");

        }, this));

    },

    activityDraggingStarted: function (e) {
        // Get Activity Location Id
        var alId = this.selectedId;

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(alId);
        var marker = location.get("marker");

        // Set Marker Size to Large while dragging
        marker.updateSize("large");
    },

    activityDraggingStopped: function (e) {

        // Get Activity Location Id
        var alId = this.selectedId;

        // Get the location of the activity we're changing
        var location = this.model.getLocationById(alId);
        var marker = location.get("marker");
        var mapMarker = marker.toMap();

        // Set Marker Size to medium while dragging
        marker.updateSize("medium");

        // Prepare Marker for Dragging and Enable
        this.prepareMarkerForDragging(mapMarker);

        // Assign event on popup open if one doesn't exist
        if (mapMarker._popup === undefined || mapMarker._popup.name != "drag-confirm") {
            mapMarker.on("popupopen", function () {
                // Assign Event to Button Click, using a this proxy for event
                $("#save-location").on("click", $.proxy(function () {
                    mapMarker.closePopup().unbindPopup();
                    this.savePreciseMarkerLocation();
                }, this));

            }, this);

            // Create Popup
            mapMarker.bindPopup("Continue dragging to location or <div id='save-location' class='defaultButton edit unselectableText'>Save Location</div>", {'closeButton': false}).openPopup();
            mapMarker._popup.name = "drag-confirm";
        }

        setTimeout(function () {
            if (mapMarker._popup !== undefined && mapMarker._popup._isOpen === false) {
                mapMarker.openPopup();
            }
        }, 100);
    },

    linkActivityToTable: function (marker) {
        marker.on('mouseover', $.proxy(this.activityMouseOver, this));
        marker.on('mouseout', $.proxy(this.activityMouseOut, this));
    },

    activityMouseOver: function (evt) {
        var alId = evt.target.feature.properties.activityLocationId;
        $('.locationsTableView .table .selected').removeClass('selected');
        $('#' + alId).addClass('selected');
        var marker = this.model.getMarkerById(alId);
        marker.highlight();
    },

    activityMouseOut: function (evt) {
        var alId = evt.target.feature.properties.activityLocationId;
        $('#' + alId).removeClass('selected');
        var marker = this.model.getMarkerById(alId);
        marker.unhighlight();
    },

    unlinkActivityToTable: function (marker) {
        marker.clearAllEventListeners();
    },

    // Get Feature Json, DEPRECIATED
    getFeatureJson: function (geometry, built, properties, options) {
        returnJson = {
            "type": "Feature",
            "geometry": geometry.toGeojson(),
            "properties": properties,
            "built": built
        }
        if (options != undefined) {
            returnJson = $.extend(returnJson, options);
        }
        return returnJson;
    },

    getGeometryLat: function (geometry) {
        return geometry.coordinates[1];
    },

    getGeometryLng: function (geometry) {
        return geometry.coordinates[0];
    },

    updateMapCenter: function (mapCenter, zoomLevel) {
        if (this.lastMapPos !== undefined) {
            this.map.infoControl.removeInfo(this.lastMapPos);
        }
        var newMapPos = "Lat: " + mapCenter.lat + ", Lng: " + mapCenter.lng + ", Zoom: " + zoomLevel;
        this.map.infoControl.addInfo(newMapPos);
        this.lastMapPos = newMapPos;
    },

    drawLocationsMap: function () {

        this.geospatialSettings = Drupal.settings.activitydb.programs[this.renderOptions.programId].geospatialSettings;
        if (this.geospatialSettings !== undefined) {
            this.centerX = parseFloat(this.geospatialSettings.centerX);
            this.centerY = parseFloat(this.geospatialSettings.centerY);
            this.defaultZoom = parseFloat(this.geospatialSettings.defaultZoom);
        } else {
            this.centerX = 0;
            this.centerY = 0;
            this.defaultZoom = 2;
        }

        this.map = L.mapbox.map('lmap', '<MAP ID REDACTED>', {
            minZoom: this.defaultZoom - 1,
            fullscreenControl: true
        });

        if (this.model !== undefined && this.model.size() > 0) {
            var geoData = [];
            var activityLatLngs = [];

            this.model.each(function (location) {
                var activityJson = this.getFeatureJson(location.displayLocation(), "Initially", {
                    activityLocationId: location.get('activityLocationId'),
                    gazetteerId: location.get('gazetteerId')
                });
                geoData.push(activityJson);

                activityLatLngs.push(location.getLatLng());
            }, this);

            activitiesBounds = new L.LatLngBounds(activityLatLngs);

            this.addActivityLocationsToMap(geoData);
        }

        this.map.setView([this.centerX, this.centerY], this.defaultZoom);

        this.map.on("moveend", function () {
            this.updateMapCenter(this.map.getCenter(), this.map.getZoom());
        }, this);
    },

    updateNewLocationData: function (updateOptions) {
        // Grab the recently updated location
        var location = this.model.getLocationById(updateOptions.existingActivityLocationId);

        // Check if there was a recently added activity location that needs an id update
        if (updateOptions.newActivityLocationId !== undefined) {

            location.convertNewToExisting(updateOptions.newActivityLocationId);

            $("tr#" + updateOptions.existingActivityLocationId).attr("id", updateOptions.newActivityLocationId);

            $("#edit-" + updateOptions.existingActivityLocationId).attr("id", "edit-" + updateOptions.newActivityLocationId)
                .attr("data-loc-id", updateOptions.newActivityLocationId).data('locId', updateOptions.newActivityLocationId);
            $("#remove-" + updateOptions.existingActivityLocationId).attr("id", "remove-" + updateOptions.newActivityLocationId)
                .attr("data-loc-id", updateOptions.newActivityLocationId).data('locId', updateOptions.newActivityLocationId);

            // Check if activity location uses a default location. If so, update the specify location button
            if (updateOptions.newLocationId === undefined) {
                $("#add-precise-" + updateOptions.existingActivityLocationId).attr("id", "add-precise-" + updateOptions.newActivityLocationId)
                    .attr("data-loc-id", updateOptions.newActivityLocationId).data('locId', updateOptions.newActivityLocationId);
            }
        }

        // Link Activity Markers to the Table Row
        this.linkActivityToTable(location.get("marker").toMap());

        // Activate Functionality of all Location Row's buttons
        $("tr#" + updateOptions.newActivityLocationId + " input, tr#" + updateOptions.newActivityLocationId + " button").on("click", $.proxy(this.activityButtonClicked, this));

        // Activate Popover for new location
        this.table.attachCoordinatesPopover($('.locationsTableView .table tr#' + updateOptions.newActivityLocationId + ' .place'));

        if (location.displayLocationType() == "preciseLocation") {
            this.table.attachPreciseCoordinatesPopover($('.locationsTableView .table tr#' + updateOptions.newActivityLocationId + ' .precise_location'));
        }
    },

    saveLocations: function (onSuccessMessage, messageType) {
        this.model.sync("update", this.model, {
            success: $.proxy(function (data) {
                if (data.status == "error") {
                    window.app.displayError(data.message);
                    $.unblockUI();
                } else {
                    $.each(data.result.results, $.proxy(function (idx, newItem) {
                        this.updateNewLocationData({
                            existingActivityLocationId: newItem.matchWith.activityLocationId,
                            newActivityLocationId: newItem.new.activityLocationId,
                            newLocationId: newItem.new.locationId
                        });
                    }, this));
                    if (onSuccessMessage !== undefined) {
                        if (messageType === undefined) {
                            messageType = "Success";
                        }
                        window.app["display" + messageType](onSuccessMessage);
                    }
                }
            }, this),
            error: function (data) {
                window.app.displayError(data);
                $.unblockUI();
            }
        });
    }

});
