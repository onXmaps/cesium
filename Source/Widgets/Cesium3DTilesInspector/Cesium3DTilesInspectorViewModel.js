/*global define*/
define([
        '../../Scene/Cesium3DTileFeature',
        '../../Scene/Cesium3DTileset',
        '../../Scene/Cesium3DTileStyle',
        '../../Scene/Cesium3DTileColorBlendMode',
        '../../Core/Check',
        '../../Core/Color',
        '../../Core/defined',
        '../../Core/defineProperties',
        '../../Core/destroyObject',
        '../../ThirdParty/knockout',
        '../../Scene/PerformanceDisplay',
        '../../Core/ScreenSpaceEventHandler',
        '../../Core/ScreenSpaceEventType'
], function(
        Cesium3DTileFeature,
        Cesium3DTileset,
        Cesium3DTileStyle,
        Cesium3DTileColorBlendMode,
        Check,
        Color,
        defined,
        defineProperties,
        destroyObject,
        knockout,
        PerformanceDisplay,
        ScreenSpaceEventHandler,
        ScreenSpaceEventType) {
    'use strict';

    function getPickTileset(viewModel) {
        return function(e) {
            var pick = viewModel._scene.pick(e.position);
            if (defined(pick) && pick.primitive instanceof Cesium3DTileset) {
                viewModel.tileset = pick.primitive;
            }
            viewModel.pickActive = false;
        };
    }

    var stringOptions = {
        maximumFractionDigits : 3
    };

    function formatMemoryString(memorySizeInBytes) {
        var memoryInMegabytes = memorySizeInBytes / 1048576;
        if (memoryInMegabytes < 1.0) {
            return memoryInMegabytes.toLocaleString(undefined, stringOptions);
        } else {
            return Math.round(memoryInMegabytes).toLocaleString();
        }
    }

    function getStatistics(tileset, isPick) {
        if (!defined(tileset)) {
            return '';
        }

        var statistics = tileset.statistics;

        // Since the pick pass uses a smaller frustum around the pixel of interest,
        // the statistics will be different than the normal render pass.
        var s = '<ul class="cesium-cesiumInspector-statistics">';
        s +=
            // --- Rendering statistics
            '<li><strong>Visited: </strong>' + statistics.visited.toLocaleString() + '</li>' +
            // Number of commands returned is likely to be higher than the number of tiles selected
            // because of tiles that create multiple commands.
            '<li><strong>Selected: </strong>' + tileset._selectedTiles.length.toLocaleString() + '</li>' +
            // Number of commands executed is likely to be higher because of commands overlapping
            // multiple frustums.
            '<li><strong>Commands: </strong>' + statistics.numberOfCommands.toLocaleString() + '</li>';
        s += '</ul>';
        if (!isPick) {
            s += '<ul class="cesium-cesiumInspector-statistics">';
            s +=
                // --- Cache/loading statistics
                '<li><strong>Requests: </strong>' + statistics.numberOfPendingRequests.toLocaleString() + '</li>' +
                '<li><strong>Attempted: </strong>' + statistics.numberOfAttemptedRequests.toLocaleString() + '</li>' +
                '<li><strong>Processing: </strong>' + statistics.numberProcessing.toLocaleString() + '</li>' +
                '<li><strong>Content Ready: </strong>' + statistics.numberContentReady.toLocaleString() + '</li>' +
                // Total number of tiles includes tiles without content, so "Ready" may never reach
                // "Total."  Total also will increase when a tile with a tileset.json content is loaded.
                '<li><strong>Total: </strong>' + statistics.numberTotal.toLocaleString() + '</li>';
            s += '</ul>';
            s += '<ul class="cesium-cesiumInspector-statistics">';
            s +=
                // --- Features statistics
                '<li><strong>Features Selected: </strong>' + statistics.numberOfFeaturesSelected.toLocaleString() + '</li>' +
                '<li><strong>Features Loaded: </strong>' + statistics.numberOfFeaturesLoaded.toLocaleString() + '</li>' +
                '<li><strong>Points Selected: </strong>' + statistics.numberOfPointsSelected.toLocaleString() + '</li>' +
                '<li><strong>Points Loaded: </strong>' + statistics.numberOfPointsLoaded.toLocaleString() + '</li>' +
                '<li><strong>Triangles Selected: </strong>' + statistics.numberOfTrianglesSelected.toLocaleString() + '</li>';
            s += '</ul>';
            s += '<ul class="cesium-cesiumInspector-statistics">';
            s +=
                // --- Styling statistics
                '<li><strong>Tiles styled: </strong>' + statistics.numberOfTilesStyled.toLocaleString() + '</li>' +
                '<li><strong>Features styled: </strong>' + statistics.numberOfFeaturesStyled.toLocaleString() + '</li>';
            s += '</ul>';
            s += '<ul class="cesium-cesiumInspector-statistics">';
            s +=
                // --- Optimization statistics
                '<li><strong>Children Union Culled: </strong>' + statistics.numberOfTilesCulledWithChildrenUnion.toLocaleString() + '</li>';
            s += '</ul>';
            s += '<ul class="cesium-cesiumInspector-statistics">';
            s +=
                // --- Memory statistics
                '<li><strong>Geometry Memory (MB): </strong>' + formatMemoryString(statistics.geometryByteLength) + '</li>' +
                '<li><strong>Texture Memory (MB): </strong>' + formatMemoryString(statistics.texturesByteLength) + '</li>' +
                '<li><strong>Batch Table Memory (MB): </strong>' + formatMemoryString(statistics.batchTableByteLength) + '</li>';
            s += '</ul>';
        }
        return s;
    }

    var colorBlendModes = [{
        text : 'Highlight',
        value : Cesium3DTileColorBlendMode.HIGHLIGHT
    }, {
        text : 'Replace',
        value : Cesium3DTileColorBlendMode.REPLACE
    }, {
        text : 'Mix',
        value : Cesium3DTileColorBlendMode.MIX
    }];

    var highlightColor = new Color(1.0, 1.0, 0.0, 0.4);
    var scratchColor = new Color();
    var oldColor = new Color();

    /**
     * The view model for {@link Cesium3DTilesInspector}.
     * @alias Cesium3DTilesInspectorViewModel
     * @constructor
     *
     * @param {Scene} scene The scene instance to use.
     * @param {HTMLElement} performanceContainer The container for the performance display
     */
    function Cesium3DTilesInspectorViewModel(scene, performanceContainer) {
        //>>includeStart('debug', pragmas.debug);
        Check.typeOf.object('scene', scene);
        Check.typeOf.object('performanceContainer', performanceContainer);
        //>>includeEnd('debug');

        var that = this;
        var canvas = scene.canvas;
        this._eventHandler = new ScreenSpaceEventHandler(canvas);
        this._scene = scene;
        this._performanceContainer = performanceContainer;
        this._canvas = canvas;

        this._performanceDisplay = new PerformanceDisplay({
            container : performanceContainer
        });

        this._statisticsText = '';
        this._pickStatisticsText = '';
        this._editorError = '';

        /**
         * Gets or sets the flag to enable performance display.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.performance = false;

        /**
         * Gets or sets the flag to show statistics.  This property is observable.
         *
         * @type {Boolean}
         * @default true
         */
        this.showStatistics = true;

        /**
         * Gets or sets the flag to show pick statistics.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.showPickStatistics = true;

        /**
         * Gets or sets the flag to show the inspector.  This property is observable.
         *
         * @type {Boolean}
         * @default true
         */
        this.inspectorVisible = true;

        /**
         * Gets or sets the flag to show the tileset section.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.tilesetVisible = false;

        /**
         * Gets or sets the flag to show the display section.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.displayVisible = false;

        /**
         * Gets or sets the flag to show the update section.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.updateVisible = false;

        /**
         * Gets or sets the flag to show the logging section.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.loggingVisible = false;

        /**
         * Gets or sets the flag to show the style section.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.styleVisible = false;

        /**
         * Gets or sets the flag to show the tile info section.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.tileDebugLabelsVisible = false;

        /**
         * Gets or sets the JSON for the tileset style.  This property is observable.
         *
         * @type {String}
         * @default '{}'
         */
        this.styleString = '{}';

        this._tileset = undefined;
        this._feature = undefined;
        this._tile = undefined;

        knockout.track(this, ['performance', 'inspectorVisible', '_statisticsText', '_pickStatisticsText', '_editorError', 'showPickStatistics', 'showStatistics',
                              'tilesetVisible', 'displayVisible', 'updateVisible', 'loggingVisible', 'styleVisible', 'tileDebugLabelsVisible', 'styleString', '_feature', '_tile']);

        this._properties = knockout.observable({});
        /**
         * Gets the names of the properties in the tileset.  This property is observable.
         * @type {String[]}
         * @readonly
         */
        this.properties = [];
        knockout.defineProperty(this, 'properties', function() {
            var names = [];
            var properties = that._properties();
            for (var prop in properties) {
                if (properties.hasOwnProperty(prop)) {
                    names.push(prop);
                }
            }
            return names;
        });

        var dynamicScreenSpaceError = knockout.observable();
        knockout.defineProperty(this, 'dynamicScreenSpaceError', {
            get : function() {
                return dynamicScreenSpaceError();
            },
            set : function(value) {
                dynamicScreenSpaceError(value);
                if (defined(that._tileset)) {
                    that._tileset.dynamicScreenSpaceError = value;
                }
            }
        });
        /**
         * Gets or sets the flag to enable dynamic screen space error.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.dynamicScreenSpaceError = false;

        var colorBlendMode = knockout.observable();
        knockout.defineProperty(this, 'colorBlendMode', {
            get : function() {
                return colorBlendMode();
            },
            set : function(value) {
                colorBlendMode(value);
                if (defined(that._tileset)) {
                    that._tileset.colorBlendMode = value;
                }
            }
        });
        /**
         * Gets or sets the color blend mode.  This property is observable.
         *
         * @type {Cesium3DTileColorBlendMode}
         * @default Cesium3DTileColorBlendMode.HIGHLIGHT
         */
        this.colorBlendMode = Cesium3DTileColorBlendMode.HIGHLIGHT;

        var picking = knockout.observable();
        knockout.defineProperty(this, 'picking', {
            get : function() {
                return picking();
            },
            set : function(value) {
                picking(value);
                if (value) {
                    that._eventHandler.setInputAction(function(e) {
                        var picked = scene.pick(e.endPosition);
                        if (picked instanceof Cesium3DTileFeature) {
                            // Picked a feature
                            that.feature = picked;
                            that.tile = picked.content.tile;
                        } else if (defined(picked) && defined(picked.content)) {
                            // Picked a tile
                            that.feature = undefined;
                            that.tile = picked.content.tile;
                        } else {
                            // Picked nothing
                            that.feature = undefined;
                            that.tile = undefined;
                        }
                        if (!defined(that._tileset)) {
                            return;
                        }
                        if (showOnlyPickedTileDebugLabel && defined(picked) && defined(picked.content)) {
                            var position;
                            if (scene.pickPositionSupported) {
                                position = scene.pickPosition(e.endPosition);
                                if (defined(position)) {
                                    that._tileset.debugPickPosition = position;
                                }
                            }
                            that._tileset.debugPickedTile = picked.content.tile;
                        } else {
                            that._tileset.debugPickedTile = undefined;
                        }
                    }, ScreenSpaceEventType.MOUSE_MOVE);
                } else {
                    that.feature = undefined;
                    that.tile = undefined;
                    that._eventHandler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
                }
            }
        });
        /**
         * Gets or sets the flag to enable picking.  This property is observable.
         *
         * @type {Boolean}
         * @default true
         */
        this.picking = true;

        var colorize = knockout.observable();
        knockout.defineProperty(this, 'colorize', {
            get : function() {
                return colorize();
            },
            set : function(value) {
                colorize(value);
                if (defined(that._tileset)) {
                    that._tileset.debugColorizeTiles = value;
                }
            }
        });
        /**
         * Gets or sets the flag to colorize tiles.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.colorize = false;

        var wireframe = knockout.observable();
        knockout.defineProperty(this, 'wireframe', {
            get : function() {
                return wireframe();
            },
            set : function(value) {
                wireframe(value);
                if (defined(that._tileset)) {
                    that._tileset.debugWireframe = value;
                }
            }
        });
        /**
         * Gets or sets the flag to draw with wireframe.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.wireframe = false;

        var showBoundingVolumes = knockout.observable();
        knockout.defineProperty(this, 'showBoundingVolumes', {
            get : function() {
                return showBoundingVolumes();
            },
            set : function(value) {
                showBoundingVolumes(value);
                if (defined(that._tileset)) {
                    that._tileset.debugShowBoundingVolume = value;
                }
            }
        });
        /**
         * Gets or sets the flag to show bounding volumes.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.showBoundingVolumes = false;

        var showContentBoundingVolumes = knockout.observable();
        knockout.defineProperty(this, 'showContentBoundingVolumes', {
            get : function() {
                return showContentBoundingVolumes();
            },
            set : function(value) {
                showContentBoundingVolumes(value);
                if (defined(that._tileset)) {
                    that._tileset.debugShowContentBoundingVolume = value;
                }
            }
        });
        /**
         * Gets or sets the flag to show content volumes.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.showContentBoundingVolumes = false;

        var showRequestVolumes = knockout.observable();
        knockout.defineProperty(this, 'showRequestVolumes', {
            get : function() {
                return showRequestVolumes();
            },
            set : function(value) {
                showRequestVolumes(value);
                if (defined(that._tileset)) {
                    that._tileset.debugShowViewerRequestVolume = value;
                }
            }
        });
        /**
         * Gets or sets the flag to show request volumes.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.showRequestVolumes = false;

        var freezeFrame = knockout.observable();
        knockout.defineProperty(this, 'freezeFrame', {
            get : function() {
                return freezeFrame();
            },
            set : function(value) {
                freezeFrame(value);
                if (defined(that._tileset)) {
                    that._tileset.debugFreezeFrame = value;
                    that._scene.debugShowFrustumPlanes = value;
                }
            }
        });
        /**
         * Gets or sets the flag to suspend updates.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.freezeFrame = false;

        var showOnlyPickedTileDebugLabel = knockout.observable();
        knockout.defineProperty(this, 'showOnlyPickedTileDebugLabel', {
            get : function() {
                return showOnlyPickedTileDebugLabel();
            },
            set : function(value) {
                showOnlyPickedTileDebugLabel(value);
                if (defined(that._tileset)) {
                    that._tileset.debugPickedTileLabelOnly = value;
                }
            }
        });
        /**
         * Gets or sets the flag to show debug labels only for the currently picked tile.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.showOnlyPickedTileDebugLabel = false;

        var showGeometricError = knockout.observable();
        knockout.defineProperty(this, 'showGeometricError', {
            get : function() {
                return showGeometricError();
            },
            set : function(value) {
                showGeometricError(value);
                if (defined(that._tileset)) {
                    that._tileset.debugShowGeometricError = value;
                }
            }
        });
        /**
         * Gets or sets the flag to show tile geometric error.  This property is observable.
         *
         * @type {Boolean}
         * @default false
         */
        this.showGeometricError = false;

        var showRenderingStatistics = knockout.observable();
        knockout.defineProperty(this, 'showRenderingStatistics', {
            get : function() {
                return showRenderingStatistics();
            },
            set : function(value) {
                showRenderingStatistics(value);
                if (defined(that._tileset)) {
                    that._tileset.debugShowRenderingStatistics = value;
                }
            }
        });
        /**
         * Displays the number of commands, points, triangles and features used per tile.  This property is observable.
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         *
         * @type {Boolean}
         * @default false
         */
        this.showRenderingStatistics = false;

        var showMemoryUsage = knockout.observable();
        knockout.defineProperty(this, 'showMemoryUsage', {
            get : function() {
                return showMemoryUsage();
            },
            set : function(value) {
                showMemoryUsage(value);
                if (defined(that._tileset)) {
                    that._tileset.debugShowMemoryUsage = value;
                }
            }
        });
        /**
         * Displays the memory used per tile.  This property is observable.
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         *
         * @type {Boolean}
         * @default false
         */
        this.showMemoryUsage = false;

        var maximumScreenSpaceError = knockout.observable();
        knockout.defineProperty(this, 'maximumScreenSpaceError', {
            get : function() {
                return maximumScreenSpaceError();
            },
            set : function(value) {
                value = Number(value);
                if (!isNaN(value)) {
                    maximumScreenSpaceError(value);
                    if (defined(that._tileset)) {
                        that._tileset.maximumScreenSpaceError = value;
                    }
                }
            }
        });
        /**
         * Gets or sets the maximum screen space error.  This property is observable.
         *
         * @type {Number}
         * @default 16
         */
        this.maximumScreenSpaceError = 16;

        var dynamicScreenSpaceErrorDensity = knockout.observable();
        knockout.defineProperty(this, 'dynamicScreenSpaceErrorDensity', {
            get : function() {
                return dynamicScreenSpaceErrorDensity();
            },
            set : function(value) {
                value = Number(value);
                if (!isNaN(value)) {
                    dynamicScreenSpaceErrorDensity(value);
                    if (defined(that._tileset)) {
                        that._tileset.dynamicScreenSpaceErrorDensity = value;
                    }
                }
            }
        });
        /**
         * Gets or sets the dynamic screen space error density.  This property is observable.
         *
         * @type {Number}
         * @default 0.00278
         */
        this.dynamicScreenSpaceErrorDensity = 0.00278;

        /**
         * Gets or sets the dynamic screen space error density slider value.
         * This allows the slider to be exponential because values tend to be closer to 0 than 1.
         * This property is observable.
         *
         * @type {Number}
         * @default 0.00278
         */
        this.dynamicScreenSpaceErrorDensitySliderValue = undefined;
        knockout.defineProperty(this, 'dynamicScreenSpaceErrorDensitySliderValue', {
            get : function() {
                return Math.pow(dynamicScreenSpaceErrorDensity(), 1 / 6);
            },
            set : function(value) {
                dynamicScreenSpaceErrorDensity(Math.pow(value, 6));
            }
        });

        var dynamicScreenSpaceErrorFactor = knockout.observable();
        knockout.defineProperty(this, 'dynamicScreenSpaceErrorFactor', {
            get : function() {
                return dynamicScreenSpaceErrorFactor();
            },
            set : function(value) {
                value = Number(value);
                if (!isNaN(value)) {
                    dynamicScreenSpaceErrorFactor(value);
                    if (defined(that._tileset)) {
                        that._tileset.dynamicScreenSpaceErrorFactor = value;
                    }
                }
            }
        });
        /**
         * Gets or sets the dynamic screen space error factor.  This property is observable.
         *
         * @type {Number}
         * @default 4.0
         */
        this.dynamicScreenSpaceErrorFactor = 4.0;

        var pickTileset = getPickTileset(this);
        var pickActive = knockout.observable();
        knockout.defineProperty(this, 'pickActive', {
            get : function() {
                return pickActive();
            },
            set : function(value) {
                pickActive(value);
                if (value) {
                    that._eventHandler.setInputAction(pickTileset, ScreenSpaceEventType.LEFT_CLICK);
                } else {
                    that._eventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
                }
            }
        });
        /**
         * Gets or sets the pick state
         *
         * @type {Boolean}
         * @default false
         */
        this.pickActive = false;

        this._style = undefined;
        this._shouldStyle = false;
        this._definedProperties = ['properties', 'dynamicScreenSpaceError', 'colorBlendMode', 'picking', 'colorize', 'wireframe', 'showBoundingVolumes',
                                   'showContentBoundingVolumes', 'showRequestVolumes', 'freezeFrame', 'maximumScreenSpaceError', 'dynamicScreenSpaceErrorDensity',
                                   'dynamicScreenSpaceErrorDensitySliderValue', 'dynamicScreenSpaceErrorFactor', 'pickActive', 'showOnlyPickedTileDebugLabel', 'showGeometricError',
                                   'showRenderingStatistics', 'showMemoryUsage'];
        this._removePostRenderEvent = scene.postRender.addEventListener(function() {
            that._update();
        });
    }

    defineProperties(Cesium3DTilesInspectorViewModel.prototype, {
        /**
         * Gets the scene
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {Scene}
         * @readonly
         */
        scene: {
            get: function() {
                return this._scene;
            }
        },
        /**
         * Gets the performance container
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {HTMLElement}
         * @readonly
         */
        performanceContainer: {
            get: function() {
                return this._performanceContainer;
            }
        },

        /**
         * Gets the statistics text.  This property is observable.
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {String}
         * @readonly
         */
        statisticsText : {
            get : function() {
                return this._statisticsText;
            }
        },
        /**
         * Gets the pick statistics text.  This property is observable.
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {String}
         * @readonly
         */
        pickStatisticsText : {
            get : function() {
                return this._pickStatisticsText;
            }
        },

        /**
         * Gets the available blend modes
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {Object[]}
         * @readonly
         */
        colorBlendModes : {
            get : function() {
                return colorBlendModes;
            }
        },

        /**
         * Gets the editor error message
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {String}
         * @readonly
         */
        editorError : {
            get : function() {
                return this._editorError;
            }
        },

        /**
         * Gets or sets the tileset of the view model.
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {Cesium3DTileset}
         */
        tileset : {
            get : function() {
                return this._tileset;
            },
            set : function(tileset) {
                this._tileset = tileset;
                this._style = undefined;
                this.styleString = '{}';
                this.feature = undefined;
                this.tile = undefined;

                if (defined(tileset)) {
                    var that = this;
                    tileset.readyPromise.then(function(t) {
                        if (!that.isDestroyed()) {
                            that._properties(t.properties);
                        }
                    });

                    // update tileset with existing settings
                    var settings = ['colorize',
                                    'wireframe',
                                    'showBoundingVolumes',
                                    'showContentBoundingVolumes',
                                    'showRequestVolumes',
                                    'freezeFrame',
                                    'showOnlyPickedTileDebugLabel',
                                    'showGeometricError',
                                    'showRenderingStatistics',
                                    'showMemoryUsage'];
                    var length = settings.length;
                    for (var i = 0; i < length; ++i) {
                        var setting = settings[i];
                        this[setting] = this[setting];
                    }

                    // update view model with existing tileset settings
                    this.maximumScreenSpaceError = tileset.maximumScreenSpaceError;
                    this.dynamicScreenSpaceError = tileset.dynamicScreenSpaceError;
                    this.dynamicScreenSpaceErrorDensity = tileset.dynamicScreenSpaceErrorDensity;
                    this.dynamicScreenSpaceErrorFactor = tileset.dynamicScreenSpaceErrorFactor;
                    this.colorBlendMode = tileset.colorBlendMode;
                } else {
                    this._properties({});
                }

                this._statisticsText = getStatistics(tileset, false);
                this._pickStatisticsText = getStatistics(tileset, true);
            }
        },

        /**
         * Gets the current feature of the view model.
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {Cesium3DTileFeature}
         */
        feature : {
            get : function() {
                return this._feature;
            },
            set : function(feature) {
                if (this._feature === feature) {
                    return;
                }
                var currentFeature = this._feature;
                if (defined(currentFeature)) {
                    // Restore original color to feature that is no longer selected
                    var frameState = this._scene.frameState;
                    if (!this.colorize && defined(this._style)) {
                        currentFeature.color = this._style.color.evaluateColor(frameState, currentFeature, scratchColor);
                    } else {
                        currentFeature.color = oldColor;
                    }
                }
                if (defined(feature)) {
                    // Highlight new feature
                    Color.clone(feature.color, oldColor);
                    feature.color = highlightColor;
                }
                this._feature = feature;
            }
        },

        /**
         * Gets the current tile of the view model
         * @memberof Cesium3DTilesInspectorViewModel.prototype
         * @type {Cesium3DTile}
         */
        tile : {
            get : function() {
                return this._tile;
            },
            set : function(tile) {
                if (this._tile === tile) {
                    return;
                }
                var currentTile = this._tile;

                if (defined(currentTile) && !hasFeatures(currentTile.content)) {
                    // Restore original color to tile that is no longer selected
                    currentTile.color = oldColor;
                }

                if (defined(tile) && !hasFeatures(tile.content)) {
                    // Highlight new tile
                    Color.clone(tile.color, oldColor);
                    tile.color = highlightColor;
                }
                this._tile = tile;
            }
        }
    });

    function hasFeatures(content) {
        if (content.featuresLength > 0) {
            return true;
        }
        var innerContents = content.innerContents;
        if (defined(innerContents)) {
            var length = innerContents.length;
            for (var i = 0; i < length; ++i) {
                if (!hasFeatures(innerContents[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Toggles the pick tileset mode
     */
    Cesium3DTilesInspectorViewModel.prototype.togglePickTileset = function() {
        this.pickActive = !this.pickActive;
    };

    /**
     * Toggles the inspector visibility
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleInspector = function() {
        this.inspectorVisible = !this.inspectorVisible;
    };

    /**
     * Toggles the visibility of the tileset section
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleTileset = function() {
        this.tilesetVisible = !this.tilesetVisible;
    };

    /**
     * Toggles the visibility of the display section
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleDisplay = function() {
        this.displayVisible = !this.displayVisible;
    };

    /**
     * Toggles the visibility of the update section
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleUpdate = function() {
        this.updateVisible = !this.updateVisible;
    };

    /**
     * Toggles the visibility of the logging section
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleLogging = function() {
        this.loggingVisible = !this.loggingVisible;
    };

    /**
     * Toggles the visibility of the style section
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleStyle = function() {
        this.styleVisible = !this.styleVisible;
    };

    /**
     * Toggles the visibility of the tile Debug Info section
     */
    Cesium3DTilesInspectorViewModel.prototype.toggleTileDebugLabels = function() {
        this.tileDebugLabelsVisible = !this.tileDebugLabelsVisible;
    };

    /**
     * Trims tile cache
     */
    Cesium3DTilesInspectorViewModel.prototype.trimTilesCache = function() {
        if (defined(this._tileset)) {
            this._tileset.trimLoadedTiles();
        }
    };

    /**
     * Compiles the style in the style editor.
     */
    Cesium3DTilesInspectorViewModel.prototype.compileStyle = function() {
        var tileset = this._tileset;
        if (!defined(tileset) || this.styleString === JSON.stringify(tileset.style)) {
            return;
        }
        this._editorError = '';
        try {
            if (this.styleString.length === 0) {
                this.styleString = '{}';
            }
            this._style = new Cesium3DTileStyle(JSON.parse(this.styleString));
            this._shouldStyle = true;
        } catch (err) {
            this._editorError = err.toString();
        }

        // set feature again so pick coloring is set
        this.feature = this._feature;
        this.tile = this._tile;
    };

    /**
     * Handles key press events on the style editor.
     */
    Cesium3DTilesInspectorViewModel.prototype.styleEditorKeyPress = function(sender, event) {
        if (event.keyCode === 9) { //tab
            event.preventDefault();
            var textArea = event.target;
            var start = textArea.selectionStart;
            var end = textArea.selectionEnd;
            var newEnd = end;
            var selected = textArea.value.slice(start, end);
            var lines = selected.split('\n');
            var length = lines.length;
            var i;
            if (!event.shiftKey) {
                for (i = 0; i < length; ++i) {
                    lines[i] = '  ' + lines[i];
                    newEnd += 2;
                }
            } else {
                for (i = 0; i < length; ++i) {
                    if (lines[i][0] === ' ') {
                        if (lines[i][1] === ' ') {
                            lines[i] = lines[i].substr(2);
                            newEnd -= 2;
                        } else {
                            lines[i] = lines[i].substr(1);
                            newEnd -= 1;
                        }
                    }
                }
            }
            var newText = lines.join('\n');
            textArea.value = textArea.value.slice(0, start) + newText + textArea.value.slice(end);
            textArea.selectionStart = start !== end ? start : newEnd;
            textArea.selectionEnd = newEnd;
        } else if (event.ctrlKey && (event.keyCode === 10 || event.keyCode === 13)) { //ctrl + enter
            this.compileStyle();
        }
        return true;
    };

    /**
     * Updates the values of view model
     * @private
     */
    Cesium3DTilesInspectorViewModel.prototype._update = function() {
        var tileset = this._tileset;

        if (this.performance) {
            this._performanceDisplay.update();
        }

        if (defined(tileset)) {
            var style = tileset.style;
            if (this._style !== tileset.style) {
                if (this._shouldStyle) {
                    tileset.style = this._style;
                    this._shouldStyle = false;
                } else {
                    this._style = style;
                    this.styleString = JSON.stringify(style.style, null, '  ');
                }
            }
        }
        if (this.showStatistics) {
            this._statisticsText = getStatistics(tileset, false);
            this._pickStatisticsText = getStatistics(tileset, true);
        }
    };

    /**
     * @returns {Boolean} true if the object has been destroyed, false otherwise.
     */
    Cesium3DTilesInspectorViewModel.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Destroys the widget.  Should be called if permanently
     * removing the widget from layout.
     */
    Cesium3DTilesInspectorViewModel.prototype.destroy = function() {
        this._eventHandler.destroy();
        this._removePostRenderEvent();

        var that = this;
        this._definedProperties.forEach(function(property) {
            knockout.getObservable(that, property).dispose();
        });

        return destroyObject(this);
    };

    /**
     * Generates an HTML string of the statistics
     * @param {Cesium3DTileset} tileset The tileset
     * @param {Boolean} isPick Whether this is getting the statistics for the pick pass
     * @returns {String} The formatted statistics
     */
    Cesium3DTilesInspectorViewModel.getStatistics = getStatistics;

    return Cesium3DTilesInspectorViewModel;
});
