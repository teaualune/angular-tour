'use strict';

angular.module('angular-tour.tour', [])

  /**
   * tourConfig
   * Default configuration, can be customized by injecting tourConfig into your app and modifying it
   */
  .constant('tourConfig', {
    placement        : 'top',                  // default placement relative to target. 'top', 'right', 'left', 'bottom'
    animation        : true,                   // if tips fade in
    nextLabel        : 'Next',                 // default text in the next tip button
    scrollSpeed      : 500,                    // page scrolling speed in milliseconds
    offset           : 28,                     // how many pixels offset the tip is from the target
    backDrop         : false,                  // if there is a backdrop (gray overlay) when tour starts
    useSourceScope   : false                   // only target scope should be used (only when using virtual steps)
  })

  /**
   * TourController
   * the logic for the tour, which manages all the steps
   */
  .controller('TourController', function($scope, orderedList) {
    var self = this,
        steps = self.steps = orderedList();

    // we'll pass these in from the directive
    self.postTourCallback = self.postStepCallback = self.showStepCallback = angular.noop;
    self.currentStep = -1;

    // if currentStep changes, select the new step
    $scope.$watch( function() { return self.currentStep; },
      function ( val ) {
        self.select(val);
      }
    );

    self.select = function(nextIndex) {
      if(!angular.isNumber(nextIndex)) return;

      self.unselectAllSteps();
      var step = steps.get(nextIndex);
      if(step) {
        step.ttOpen = true;
      }

      // update currentStep if we manually selected this index
      if(self.currentStep !== nextIndex) {
        self.currentStep = nextIndex;
      }

      if(self.currentStep > -1)
        self.showStepCallback();

      if(nextIndex >= steps.getCount()) {
        self.postTourCallback(true);
      }
      self.postStepCallback();
    };

    self.addStep = function(step) {
      if(angular.isNumber(step.index) && !isNaN(step.index)) {
        steps.set(step.index, step);
      } else {
        steps.push(step);
      }
    };

    self.unselectAllSteps = function() {
      steps.forEach(function (step) {
        step.ttOpen = false;
      });
    };

    self.cancelTour = function () {
      self.unselectAllSteps();
      self.postTourCallback(false);
    };

    $scope.openTour = function() {
      // open at first step if we've already finished tour
      var startStep = self.currentStep >= steps.getCount() || self.currentStep < 0  ? 0 : self.currentStep;
      self.select(startStep);
    };

    $scope.closeTour = function() {
      self.cancelTour();
    };
  })

  /**
   * Tour
   * directive that allows you to control the tour
   */
  .directive('tour', function ($parse, tourConfig) {
    return {
      controller: 'TourController',
      restrict: 'EA',
      scope: true,
      link: function (scope, element, attrs, ctrl) {
        if(!angular.isDefined(attrs.step)) {
          throw('The <tour> directive requires a `step` attribute to bind the current step to.');
        }
        var model = $parse(attrs.step);
        var backDrop = false;

        // Watch current step view model and update locally
        scope.$watch(attrs.step, function(newVal){
          ctrl.currentStep = newVal;
        });

        ctrl.postTourCallback = function(completed) {
          angular.element(document.getElementsByClassName('tour-backdrop')).remove();
          backDrop = false;
          angular.element(document.getElementsByClassName('tour-element-active')).removeClass('tour-element-active');

          if (completed && angular.isDefined(attrs.tourComplete)) {
            scope.$parent.$eval(attrs.tourComplete);
          }
          if(angular.isDefined(attrs.postTour)) {
            scope.$parent.$eval(attrs.postTour);
          }
        };

        ctrl.postStepCallback = function() {
          if(angular.isDefined(attrs.postStep)) {
            scope.$parent.$eval(attrs.postStep);
          }
        };

        ctrl.showStepCallback = function () {
          if(!backDrop && tourConfig.backDrop) {
            angular.element(document.body).append(angular.element('<div class="tour-backdrop"></div>'));
            backDrop = true;
          }
        };

        // update the current step in the view as well as in our controller
        scope.setCurrentStep = function(val) {
          model.assign(scope.$parent, val);
          ctrl.currentStep = val;
        };

        scope.getCurrentStep = function() {
          return ctrl.currentStep;
        };
      }
    };
  })

  /**
   * Tourtip
   * tourtip manages the state of the tour-popup directive
   */
  .directive('tourtip', function ($window, $compile, $interpolate, $timeout, scrollTo, tourConfig) {
    var startSym = $interpolate.startSymbol(),
        endSym = $interpolate.endSymbol();

    var template = '<div tour-popup></div>';

    return {
      require: '^tour',
      restrict: 'EA',
      scope: true,
      link: function (scope, element, attrs, tourCtrl) {
        attrs.$observe( 'tourtip', function ( val ) {
          scope.ttContent = val;
        });

        //defaults: tourConfig.placement
        attrs.$observe( 'tourtipPlacement', function (val) {
          scope.ttPlacement = (val || tourConfig.placement).toLowerCase().trim();
          scope.centered = (scope.ttPlacement.indexOf('center') === 0);
        });

        attrs.$observe( 'tourtipNextLabel', function ( val ) {
          scope.ttNextLabel = val || tourConfig.nextLabel;
        });

        attrs.$observe( 'tourtipOffset', function ( val ) {
          scope.ttOffset = parseInt(val, 10) || tourConfig.offset;
        });

        //defaults: null
        attrs.$observe( 'onShow', function (val) {
          scope.onStepShow = val || null;
        });

        //defaults: null
        attrs.$observe( 'onProceed', function (val) {
          scope.onStepProceed = val || null;
        });

        //defaults: null
        attrs.$observe( 'tourtipElement', function (val) {
          scope.ttElement = val || null;
        });

        //defaults: tourConfig.useSourceScope
        attrs.$observe( 'useSourceScope', function (val) {
          scope.ttSourceScope = !val ? tourConfig.useSourceScope : val === 'true';
        });


        scope.ttOpen = false;
        scope.ttAnimation = tourConfig.animation;
        scope.index = parseInt(attrs.tourtipStep, 10);

        var tourtip = $compile( template )( scope );
        tourCtrl.addStep(scope);

        // wrap this in a time out because the tourtip won't compile right away
        $timeout( function() {
          scope.$watch('ttOpen', function(val) {
            if(val) {
              show();
            } else {
              hide();
            }
          });
        }, 500);


        //determining target scope. It's used only when using virtual steps and there
        //is some action performed like on-show or on-progress. Without virtual steps
        //action would performed on element's scope and that would work just fine
        //however, when using virtual steps, whose steps can be placed in different
        //controller, so it affects scope, which will be used to run this action against.
        function getTargetScope() {
          var targetElement = scope.ttElement ? angular.element(document.querySelectorAll(scope.ttElement)) : element;

          var targetScope = scope;
          if(targetElement !== element && !scope.ttSourceScope)
            targetScope = targetElement.scope();

          return targetScope;
        }

        function calculatePosition(element) {
          var ttPosition;

          // Get the position of the directive element
          var position = element[0].getBoundingClientRect();

          //make it relative against page, not the window
          var top = position.top + window.pageYOffset;

          var ttWidth = tourtip.width();
          var ttHeight = tourtip.height();

          // Calculate the tourtip's top and left coordinates to center it
          switch ( scope.ttPlacement ) {
          case 'right':
            ttPosition = {
              top: top,
              left: position.left + position.width + scope.ttOffset
            };
            break;
          case 'bottom':
            ttPosition = {
              top: top + position.height + scope.ttOffset,
              left: position.left
            };
            break;
          case 'center':
            ttPosition = {
              top: top + 0.5 * (position.height - ttHeight) + scope.ttOffset,
              left: position.left + 0.5 * (position.width - ttWidth)
            };
            break;
          case 'center-top':
            ttPosition = {
              top: top + 0.1 * (position.height - ttHeight) + scope.ttOffset,
              left: position.left + 0.5 * (position.width - ttWidth)
            };
            break;
          case 'left':
            ttPosition = {
              top: top,
              left: position.left - ttWidth - scope.ttOffset
            };
            break;
          default:
            ttPosition = {
              top: top - ttHeight - scope.ttOffset,
              left: position.left
            };
            break;
          }

          ttPosition.top += 'px';
          ttPosition.left += 'px';

          return ttPosition;
        }

        function show() {
          if ( ! scope.ttContent ) {
            return;
          }

          // if(scope.ttAnimation)
          //   tourtip.fadeIn();
          // else {
          tourtip.css({ display: 'block' });
          // }

          var targetElement = scope.ttElement ? angular.element(document.querySelectorAll(scope.ttElement)) : element;

          if(targetElement == null || targetElement.length === 0)
            throw 'Target element could not be found. Selector: ' + scope.ttElement;

          angular.element(document.body).append(tourtip);

          var updatePosition = function() {
            var ttPosition = calculatePosition(targetElement);

            // Now set the calculated positioning.
            tourtip.css( ttPosition );

            // Scroll to the tour tip
            scrollTo(tourtip, -300, -200);
          };

          if(tourConfig.backDrop)
            focusActiveElement(targetElement);

          angular.element($window).bind('resize.' + scope.$id, updatePosition);

          updatePosition();

          if(scope.onStepShow) {
            var targetScope = getTargetScope();

            //fancy! Let's make on show action not instantly, but after a small delay
            $timeout(function() {
              targetScope.$eval(scope.onStepShow);
            }, 300);
          }
        }

        function hide() {
          tourtip.detach();
          angular.element($window).unbind('resize.' + scope.$id);
        }

        function focusActiveElement(el) {
          angular.element(document.getElementsByClassName('tour-element-active')).removeClass('tour-element-active');

          if(!scope.centered)
            el.addClass('tour-element-active');
        }

        // Make sure tooltip is destroyed and removed.
        scope.$on('$destroy', function onDestroyTourtip() {
          angular.element($window).unbind('resize.' + scope.$id);
          tourtip.remove();
          tourtip = null;
        });

        scope.proceed = function() {
          if(scope.onStepProceed){
            var targetScope = getTargetScope();

            $timeout(function() {
              targetScope.$eval(scope.onStepProceed);
            }, 100);
          }

          scope.setCurrentStep(scope.getCurrentStep() + 1);
        };
      }
    };
  })

  /**
   * TourPopup
   * the directive that actually has the template for the tip
   */
  .directive('tourPopup', function () {
    return {
      replace: true,
      templateUrl: 'tour/tour.tpl.html',
      scope: true,
      restrict: 'EA',
      link: function (scope, element, attrs) { }
    };
  })

  /**
   * OrderedList
   * Used for keeping steps in order
   */
  .factory('orderedList', function () {
    var OrderedList = function() {
      this.map = {};
      this._array = [];
    };

    OrderedList.prototype.set = function (key, value) {
      if (!angular.isNumber(key))
        return;
      if (key in this.map) {
        this.map[key] = value;
      } else {
        if (key < this._array.length) {
          var insertIndex = key - 1 > 0 ? key - 1 : 0;
          this._array.splice(insertIndex, 0, key);
        } else {
          this._array.push(key);
        }
        this.map[key] = value;
        this._array.sort(function(a,b){
          return a-b;
        });
      }
    };
    OrderedList.prototype.indexOf = function (value) {
      for (var prop in this.map) {
        if (this.map.hasOwnProperty(prop)) {
          if (this.map[prop] === value)
            return Number(prop);
        }
      }
    };
    OrderedList.prototype.push = function (value) {
      var key = this._array[this._array.length - 1] + 1 || 0;
      this._array.push(key);
      this.map[key] = value;
      this._array.sort(function(a, b) {
        return a-b;
      });
    };
    OrderedList.prototype.remove = function (key) {
      var index = this._array.indexOf(key);
      if (index === -1) {
        throw new Error('key does not exist');
      }
      this._array.splice(index, 1);
      delete this.map[key];
    };
    OrderedList.prototype.get = function (key) {
      return this.map[key];
    };
    OrderedList.prototype.getCount = function () {
      return this._array.length;
    };
    OrderedList.prototype.forEach = function (f) {
      var key, value;
      for (var i = 0; i < this._array.length; i++) {
        key = this._array[i];
        value = this.map[key];
        f(value, key);
      }
    };
    OrderedList.prototype.first = function () {
      var key, value;
      key = this._array[0];
      value = this.map[key];
      return value;
    };

    var orderedListFactory = function() {
      return new OrderedList();
    };

    return orderedListFactory;
  })

  /**
   * ScrollTo
   * Smoothly scroll to a dom element
   */
  .factory('scrollTo', function() {
    return function (target, offsetX, offsetY) {
      if (target) {
        var rect = target.getBoundingClientRect();
        offsetX = offsetX || -100;
        offsetY = offsetY || -100;
        window.scrollTo(rect.left + offsetX, rect.top + offsetY);
      } else {
        window.scrollTo(0);
      }
    };
  });