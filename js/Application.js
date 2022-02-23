/*
 Copyright 2020 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import AppBase from "./support/AppBase.js";
import AppLoader from "./loaders/AppLoader.js";

class Application extends AppBase {

  // PORTAL //
  portal;

  constructor() {
    super();

    // LOAD APPLICATION BASE //
    super.load().then(() => {

      // APPLICATION LOADER //
      const applicationLoader = new AppLoader({app: this});
      applicationLoader.load().then(({portal, group, map, view}) => {
        //console.info(portal, group, map, view);

        // PORTAL //
        this.portal = portal;

        // APP TITLE //
        this.title = this.title || map?.portalItem?.title || 'Application';
        // APP DESCRIPTION //
        this.description = this.description || map?.portalItem?.description || group?.description || '...';

        // APPLICATION //
        this.applicationReady({portal, group, map, view}).catch(this.displayError).then(() => {
          // HIDE APP LOADER //
          document.getElementById('app-loader').removeAttribute('active');
        });

      }).catch(this.displayError);
    }).catch(this.displayError);

  }

  /**
   *
   * @param view
   */
  configView(view) {
    return new Promise((resolve, reject) => {
      if (view) {
        require([
          'esri/widgets/Home',
          'esri/widgets/Search',
          'esri/widgets/LayerList',
          'esri/widgets/Legend'
        ], (Home, Search, LayerList, Legend) => {

          //
          // CONFIGURE VIEW SPECIFIC STUFF HERE //
          //
          view.set({
            constraints: {snapToZoom: false}
          });

          // HOME //
          const home = new Home({view});
          view.ui.add(home, {position: 'top-left', index: 0});

          // LEGEND //
          /*
           const legend = new Legend({ view: view });
           view.ui.add(legend, {position: 'bottom-left', index: 0});
           */

          // SEARCH /
          /*
           const search = new Search({ view: view});
           view.ui.add(legend, {position: 'top-right', index: 0});
           */

          // LAYER LIST //
          /*const layerList = new LayerList({
           container: 'layer-list-container',
           view: view,
           listItemCreatedFunction: (event) => {
           event.item.open = (event.item.layer.type === 'group');
           },
           visibleElements: {statusIndicators: true}
           });*/

          // VIEW UPDATING //
          this.disableViewUpdating = false;
          const viewUpdating = document.getElementById('view-updating');
          view.ui.add(viewUpdating, 'bottom-right');
          this._watchUtils.init(view, 'updating', updating => {
            (!this.disableViewUpdating) && viewUpdating.toggleAttribute('active', updating);
          });

          resolve();
        });
      } else { resolve(); }
    });
  }

  /**
   *
   * @param portal
   * @param group
   * @param map
   * @param view
   * @returns {Promise}
   */
  applicationReady({portal, group, map, view}) {
    return new Promise(async (resolve, reject) => {
      // VIEW READY //
      this.configView(view).then(() => {

        this.initializeTreeTypeLayer({view});

        resolve();
      }).catch(reject);
    });
  }

  /**
   *
   * @param treesLayer
   * @returns {Promise<unknown>}
   */
  displayTop10TreeTypes(treesLayer) {
    return new Promise((resolve, reject) => {

      // TREE TYPE TEMPLATE = CALCITE TILE SELECT //
      const treeTypeTemplate = document.getElementById('tree-type-template');
      const _createItemNode = () => {
        const templateNode = treeTypeTemplate.content.cloneNode(true);
        return templateNode.querySelector('calcite-tile-select');
      };

      // TREE TYPE LIST //
      const treeTypeList = document.getElementById('tree-type-list');

      // TOP 1O QUERY //
      const top10Query = treesLayer.createQuery();
      top10Query.set({
        where: '(spc_common is not null)',
        outFields: ['spc_common'],
        groupByFieldsForStatistics: ['spc_common', 'spc_latin'],
        orderByFields: ['count(*) desc'],
        outStatistics: [{"statisticType": "count", "onStatisticField": "*", "outStatisticFieldName": "countOFExpr"}],
        num: 10
      });
      treesLayer.queryFeatures(top10Query).then((top10FS) => {
        const treeTypeItemNodes = top10FS.features.map(feature => {

          const species = feature.getAttribute('spc_common');
          const latin = feature.getAttribute('spc_latin');
          const count = feature.getAttribute('countOFExpr');

          const treeItemNode = _createItemNode();
          treeItemNode.setAttribute('heading', species.toUpperCase());
          treeItemNode.setAttribute('title', latin);
          treeItemNode.setAttribute('description', `count: ${ count.toLocaleString() }`);
          treeItemNode.setAttribute('value', species);

          const treeThumb = treeItemNode.querySelector('.tree-thumbnail');
          treeThumb.src = `./assets/trees/${ species.toLowerCase().replace(/ /, '_') }.jpg`

          return treeItemNode
        });
        treeTypeList.replaceChildren(...treeTypeItemNodes);

        resolve({treeTypeList});
      });
    });
  }

  /**
   *
   * @param view
   */
  initializeTreeTypeLayer({view}) {
    require(["esri/core/promiseUtils"], (promiseUtils) => {

      const treeTypeLayer = view.map.layers.find(l => l.title === "Trees in New York");
      treeTypeLayer.load().then(() => {

        treeTypeLayer.popupEnabled = false;

        // INITIALIZE SUMMARY //
        this.initializeSummary({view, treeTypeLayer});

        // DISPLAY LIST OF TOP 1O TREE SPECIES //
        this.displayTop10TreeTypes(treeTypeLayer).then(({treeTypeList}) => {

          // INITIALIZE HISTOGRAM //
          this.initializeTreeHistogram({view, treeTypeLayer}).then(() => {

            // CLEAR SELECTION //
            const clearSelectionBtn = document.getElementById('clear-selection-btn');
            clearSelectionBtn.addEventListener('click', () => {

              // CLEAR TILE SELECT //
              treeTypeList.querySelectorAll('calcite-tile-select').forEach(tileSelect => {
                tileSelect.toggleAttribute('checked', false);
              });

              // UPDATE HISTOGRAM SLIDER //
              this.updateSliderBins();
            });

            // SET SPECIES SELECTION //
            treeTypeList.addEventListener('calciteTileSelectChange', (evt) => {

              // TREE SPECIES //
              const treeSpecies = evt.srcElement.value;

              // UPDATE HISTOGRAM SLIDER //
              this.updateSliderBins(treeSpecies);
            });
          });
        });
      });
    });
  }

  /**
   *
   *
   * @param view
   * @param treeTypeLayer
   */
  initializeTreeHistogram({view, treeTypeLayer}) {
    return new Promise((resolve, reject) => {
      require([
        "esri/core/promiseUtils",
        "esri/smartMapping/statistics/histogram",
        "esri/widgets/HistogramRangeSlider"
      ], (promiseUtils, histogram, HistogramRangeSlider) => {

        view.whenLayerView(treeTypeLayer).then(treeTypeLayerView => {

          const statField = 'tree_dbh';
          const min = 0;
          const max = 30;

          const slider = new HistogramRangeSlider({
            container: "histogram-container",
            rangeType: "between",
            includedBarColor: '#50ba5f',
            excludedBarColor: '#cbe2cb',
            precision: 0,
            labelInputsEnabled: false,
            min: min, max: max,
            values: [min, max],
            barCreatedFunction: (index, element) => {
              //const bin = slider.bins[index];
              element.setAttribute("stroke-width", "0.8");
              element.setAttribute("stroke", "#cbe2cb");
            }
          });

          const defaultHistogramParams = {
            layer: treeTypeLayer,
            field: statField,
            numBins: max,
            minValue: min,
            maxValue: max
          };

          let treeSpeciesFilter = null;
          this.updateSliderBins = (treeSpecies) => {
            treeSpeciesFilter = treeSpecies ? `(spc_common = '${ treeSpecies }')` : null;

            const params = treeSpeciesFilter
              ? {
                ...defaultHistogramParams,
                sqlWhere: treeSpeciesFilter
              }
              : defaultHistogramParams;

            histogram(params).then((histogramResponse) => {
              slider.set({
                bins: histogramResponse.bins,
              });
              updateFeatureEffect();
            });
          };
          this.updateSliderBins();

          const updateFeatureEffect = promiseUtils.debounce(() => {

            const filters = [slider.generateWhereClause(statField)];
            treeSpeciesFilter && filters.push(treeSpeciesFilter);

            treeTypeLayerView.featureEffect = {
              filter: {
                where: filters.join(' AND ')
              },
              excludedEffect: "opacity(0.0)"
            };
          });

          slider.on(["thumb-change", "thumb-drag", "segment-drag"], () => {
            updateFeatureEffect();
          });

          // RESET MIN/MAX BUTTON //
          const histogramResetBtn = document.getElementById('histogram-reset-btn');
          histogramResetBtn.addEventListener('click', () => {
            slider.set({
              values: [min, max]
            });
            updateFeatureEffect();
          });

          resolve();
        });
      });
    });
  }

  /**
   *
   *  Biggest tree (by dbh) in the buffer
   *    highlight and show biggest tree with a label?
   *  Most common tree in the buffer
   *  Avg tree size in buffer
   *
   * @param view
   * @param treeTypeLayer
   */
  initializeSummary({view, treeTypeLayer}) {
    require([
      "esri/core/promiseUtils",
      "esri/Graphic",
      "esri/layers/GraphicsLayer",
      "esri/geometry/geometryEngine"
    ], (promiseUtils, Graphic, GraphicsLayer, geometryEngine) => {


      const locationGraphic = new Graphic({
        symbol: {
          type: 'simple-marker',
          style: "circle",
          color: "white",
          size: "15pt",
          outline: {
            color: "orange",
            width: 2.5
          }
        }
      });

      const searchGraphic = new Graphic({
        symbol: {
          type: 'simple-fill',
          color: 'transparent',
          style: "diagonal-cross",
          outline: {
            color: "orange",
            width: 2.5
          }
        }
      });

      const biggestGraphic = new Graphic({
        symbol: {
          type: 'simple-marker',
          style: "square",
          color: "blue",
          size: "21pt",
          outline: {
            color: 'dodgerblue',
            width: 3
          }
        }
      });

      const locationGraphicsLayer = new GraphicsLayer({
        title: 'Filter by Location',
        effect: 'drop-shadow(1px,1px,2px)',
        graphics: [searchGraphic, locationGraphic, biggestGraphic]
      });
      view.map.add(locationGraphicsLayer);


      view.whenLayerView(treeTypeLayer).then(treeTypeLayerView => {


        const summaryAvgSizeLabel = document.getElementById('summary-avg-size-label');


        const updateSummaryDetails = promiseUtils.debounce(() => {

          const summaryQuery = treeTypeLayerView.createQuery();
          summaryQuery.set({
            geometry: searchGraphic.geometry,
            where: '(1=1)',
            outFields: ['spc_common'],
            outStatistics: [
              {"statisticType": "avg", "onStatisticField": "tree_dbh", "outStatisticFieldName": "avgTreeSize"},
              {"statisticType": "count", "onStatisticField": "spc_common", "outStatisticFieldName": "count"}
            ]
          });
          return treeTypeLayerView.queryFeatures(summaryQuery).then(summaryFS => {
            const stats = summaryFS.features[0].attributes;

            summaryAvgSizeLabel.innerHTML = stats.avgTreeSize.toLocaleString();

          });
        });


        const searchDistanceSlider = document.getElementById('search-distance-slider');
        searchDistanceSlider.addEventListener('calciteSliderInput', () => {
          if (locationGraphic.geometry) {
            searchGraphic.geometry = geometryEngine.geodesicBuffer(locationGraphic.geometry, searchDistanceSlider.value, 'miles');
            updateSummaryDetails();
          }
        });

        let clickHandler = null;
        const searchLocationBtn = document.getElementById('search-location-btn');
        searchLocationBtn.addEventListener('click', () => {
          clickHandler && clickHandler.remove();

          const active = searchLocationBtn.toggleAttribute('active');
          searchLocationBtn.setAttribute('appearance', active ? 'solid' : 'outline');
          view.container.style.cursor = active ? 'crosshair' : 'default';

          if (active) {

            clickHandler = view.on('click', ({mapPoint}) => {
              locationGraphic.geometry = mapPoint;
              searchGraphic.geometry = geometryEngine.geodesicBuffer(locationGraphic.geometry, searchDistanceSlider.value, 'miles');
              updateSummaryDetails();
            });

          } else {
            locationGraphic.geometry = null;
            searchGraphic.geometry = null;
            updateSummaryDetails();
          }
        });

      });
    });
  }

}

export default new Application();

