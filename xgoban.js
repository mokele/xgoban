if(!window.Callbacks) {
    // todo: jquery this up and remove Callbacks
    var Callbacks = function() {
        var callbacks = {};
        var callback = function(name) {
            if(!callbacks[name]) {
                callbacks[name] = [];
            }
            return function(f) {
                callbacks[name].push(f);
            };
        };
        var fire = function(name) {
            if(!callbacks[name]) {
                return;
            }
            var applyArguments = [];
            for(var i=1; i<arguments.length; i++) {
                applyArguments.push(arguments[i]);
            }
            for(var i=0; i<callbacks[name].length; i++) {
                var f = callbacks[name][i];
                if(!f) {
                    continue;
                }
                f.apply(f, applyArguments);
            }
        };
        var fireOne = function(f) {
            var applyArguments = [];
            for(var i=2; i<arguments.length; i++) {
                applyArguments.push(arguments[i]);
            }
            f.apply(f, applyArguments);
        };
        var removeCallback = function(name, f) {
            if(!callbacks[name]) {
                return;
            }
            for(var i=0; i<callbacks[name].length; i++) {
                var c = callbacks[name][i];
                if(c == f) {
                    delete callbacks[name][i];
                }
            }
        };
        return {
            fire: fire,
            fireOne: fireOne,
            callback: callback,
            removeCallback: removeCallback
        }
    };
};
var XGoban = function(sel, opts) {
    var defaultOpts = {
    };
    $.extend(defaultOpts, opts);
    opts = defaultOpts;

    var container = $(sel);
    var element;
    var svg = null;
    var canvas = null;
    var drawingElement;

    var width;
    var height;

    var points = [];
    var turn = 'BLACK';
    var callbacks = Callbacks();
    var enabled = true;
    var stateEditable = false;

    var getPoint = function(x, y) {
        // todo: sort points by x and y coord
        // so we when to stop searching
        for(var i=0; i<points.length; i++) {
            var point = points[i]
            var hitArea = point.hitArea;
            if(x >= hitArea.x && y >= hitArea.y
               && x <= hitArea.x2 && y <= hitArea.y2)
           {
               return point;
           }
        }
        return false;
    };
    var ghostElements = {};
    ghostElements['BLACK'] = opts.stoneElement('BLACK');
    ghostElements['WHITE'] = opts.stoneElement('WHITE');
    for(var k in ghostElements) {
        ghostElements[k].addClass('ghost');
    }
    var ghostElement = function() {
        return ghostElements[turn];
    };

    var lastFocusedElement = null;
    var lastFocusedPoint = null;

    var repositionElement = function(el, point) {
        var diameter = point.radius * 2;
        el.remove(); // weird resize fix - only likes to be resized while not on the page
        el.width(diameter);
        el.height(diameter);
        el.css({
            left: point.x - point.radius,
            top: point.y - point.radius
        });
        element.append(el); // weird resize fix
    };
    // todo: refactor out into a Point object
    var repositionPoint = function(pointIndex) {
        var point = points[pointIndex];
        if(point.element) {
            repositionElement(point.element, point);
        }
        if(point.overlay) {
            repositionElement(point.overlay.element, point);
        }
    };
    var place = function(pointIndex, stone, focus) {
        var point = points[pointIndex];
        if(point.stone) {
            return;
        }
        var placedElement = ghostElements[stone].clone(true);
        placedElement.removeClass('ghost');
        point.stone = stone;
        point.element = placedElement;
        repositionPoint(pointIndex);

        element.append(point.element);

        if(focus === true) {
            if(lastFocusedPoint) {
                lastFocusedElement.remove();
                lastFocusedElement = null;
                lastFocusedPoint = null;
            }
            var focusElement = opts.focusElement(stone);
            var diameter = point.radius * 2;
            focusElement.width(diameter);
            focusElement.height(diameter);
            focusElement.css({
                left: point.x - point.radius,
                top: point.y - point.radius
            });
            element.append(focusElement);
            lastFocusedElement = focusElement;
            lastFocusedPoint = point;
        }
    };
    var clearPoint = function(index) {
        var point = points[index];
        if(point.element) {
            point.element.remove();
            point.element = null;
            point.stone = null;
        }
    };
    var clear = function(index) {
        if(index === undefined) {
            for(var k in points) {
                clearPoint(k);
            }
        } else {
            clearPoint(index);
        }
    };
    
    var valueFun = function(point) {
        return function() {
            if(point.stone) {
                if(!point.overlay) {
                    return point.stone;
                } else if(point.stone == 'WHITE') {
                    return 'WHITE_DEAD';
                } else if(point.stone == 'BLACK') {
                    return 'BLACK_DEAD';
                }
            } else if(!point.overlay) {
                return 'EMPTY';
            } else if(point.overlay.color == 'WHITE') {
                return 'BLACK_TERRITORY';
            } else if(point.overlay.color == 'BLACK') {
                return 'WHITE_TERRITORY';
            }
        }
    };
    var connectedFun = function(point) {
        return function() {
            var thisValue = point.value();
            var thisNeighbours = $.extend(true, [], point.neighbours);
            var thisConnected = [point.point]
            var seen = [point.point];
            while(thisNeighbours.length > 0) {
                var neighbourIndex = thisNeighbours.shift();
                if(seen.indexOf(neighbourIndex) != -1) {
                    continue;
                }
                seen.push(neighbourIndex);
                var neighbour = points[neighbourIndex];
                if(neighbour.value() == thisValue) {
                    thisNeighbours = thisNeighbours.concat(neighbour.neighbours);
                    thisConnected.push(neighbourIndex);
                }
            }
            return thisConnected;
        };
    };
    var setupPoints = function() {
        for(var i=0; i<opts.geometry.points.length; i++) {
            var optPoint = opts.geometry.points[i];
            var x = optPoint[0];
            var y = optPoint[1];
            var neighbours = optPoint[2];
            point = {
                point: i,
                neighbours: neighbours
            };
            point.value = valueFun(point);
            point.connected = connectedFun(point);
            point.originalX = x;
            point.originalY = y;
            point.x = x;
            point.y = y;
            points[i] = point;
        }
        if(!opts.svg) {
            var ctx = canvas[0].getContext("2d");
            draw = function() {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.5;
                ctx.clearRect(0, 0, width, height);
                var lines = {};
                for(var i=0; i<points.length; i++) {
                    var point = points[i];
                    for(var j=0; j<point.neighbours.length; j++) {
                        var neighbour = points[point.neighbours[j]];
                        var key = Math.min(point.point, neighbour.point)
                                + 'x' + Math.max(point.point, neighbour.point);
                        if(!lines[key]) {
                            lines[key] = true
                            ctx.beginPath();
                            ctx.moveTo(point.x, point.y);
                            ctx.lineTo(neighbour.x, neighbour.y);
                            ctx.closePath();
                            ctx.stroke();
                        }
                    }
                }
            };
        }
    };
    var recalculatePointRadius = function() {
        var minDistance = false;
        for(var i in points) {
            var point = points[i];
            for(var j in point.neighbours) {
                var neighbour = points[point.neighbours[j]];
                var diffx = Math.abs(point.x - neighbour.x);
                var diffy = Math.abs(point.y - neighbour.y);
                var distance = Math.sqrt(diffx*diffx + diffy*diffy);
                minDistance = minDistance===false ? distance : Math.min(minDistance, distance);
            }
        }
        var pointRadius = minDistance / 2;
        for(var i in points) {
            var point = points[i];
            var x = point.x;
            var y = point.y;
            var hitArea = {
                x: x - pointRadius,
                y: y - pointRadius,
                x2: x + pointRadius,
                y2: y + pointRadius
            };
            point.originalHitArea = {
                x: hitArea.x,
                y: hitArea.y,
                x2: hitArea.x2,
                y2: hitArea.y2
            };
            point.hitArea = hitArea;
            point.originalRadius = pointRadius;
            point.radius = pointRadius;
            repositionPoint(i);
        }
    };

    var hideGhostElements = function() {
        for(var k in ghostElements) {
            ghostElements[k].remove();
        }
    };

    var draw = function() {};

    var recalculateSize = function() {
        width = container.width();
        height = container.height();
    };

    var fit = function() {
        recalculateSize();
        hideGhostElements();
        drawingElement.attr('width', width);
        drawingElement.attr('height', height);
        element.css({
            width: width,
            height: height
        });
        var ratio = width / opts.geometry.width;
        for(var i in points) {
            var point = points[i];
            point.x = point.originalX * ratio;
            point.y = point.originalY * ratio;
            /*point.radius = point.originalRadius * ratio;
            point.hitArea.x = point.originalHitArea.x * ratio;
            point.hitArea.y = point.originalHitArea.y * ratio;
            point.hitArea.x2 = point.originalHitArea.x2 * ratio;
            point.hitArea.y2 = point.originalHitArea.y2 * ratio;
            */
            //repositionPoint(i);
        }
        recalculatePointRadius();
        if(lastFocusedPoint) {
            repositionElement(lastFocusedElement, lastFocusedPoint);
        }
        draw();
    };

    $(function() {
        element = $('<div class="xgoban"></div>');
        if(opts.svg) {
            svg = $('<img />');
            svg.attr('src', opts.svg);
            drawingElement = svg;
        } else {
            canvas = $('<canvas width="'+opts.width+'" height="'+opts.height+'"></canvas>');
            drawingElement = canvas;
        }
        element.append(drawingElement);

        drawingElement.mousemove(function(e) {
            if(!enabled) {
                return;
            }
            var containerOffset = container.offset();
            var x = e.pageX - containerOffset.left;
            var y = e.pageY - containerOffset.top;
            var point = getPoint(x, y);
            if(point && !point.stone) {
                var diameter = point.radius * 2;
                ghostElement().width(diameter);
                ghostElement().height(diameter);
                ghostElement().css({
                    left: point.x - point.radius,
                    top: point.y - point.radius
                });
                var el = ghostElement();
                element.append(el);

                el.click(function(e) {
                    if(!enabled) {
                        return;
                    }
                    var x = e.pageX - containerOffset.left;
                    var y = e.pageY - containerOffset.top;
                    var point = getPoint(x, y);
                    if(!point) {
                        return;
                    }
                    place(point.point, turn, true);
                    callbacks.fire('placed', {
                        point: point.point,
                        stone: turn
                    });
                });
            } else {
                ghostElement().remove();
            }
        });
        $(document.body).click(function(e) {
            if(!stateEditable) {
                return;
            }
            var containerOffset = container.offset();
            var x = e.pageX - containerOffset.left;
            var y = e.pageY - containerOffset.top;
            var point = getPoint(x, y);
            if(point) {
                e.stopPropagation();
                e.preventDefault();
                callbacks.fire('stateEdit', e, point);
                return false;
            }
        });
        container.append(element);

        setupPoints();
        fit();
    });

    var pointToCoord = function(point) {
        return "A1";
    };

    var setPointOverlay = function(pointIndex, overlayFun) {
        var point = points[pointIndex];
        if(point.overlay) {
            point.overlay.element.remove();
            point.overlay = null;
        }
        var overlay = overlayFun(point.stone);
        var diameter = point.radius * 2;
        overlay.element.width(diameter);
        overlay.element.height(diameter);
        overlay.element.css({
            left: point.x - point.radius,
            top: point.y - point.radius
        });
        element.append(overlay.element);
        point.overlay = overlay;
    };

    return {
        svg: opts.svg,
        geometry: opts.geometry,
        type: 'x',
        size: function() {
            return 19; // todo: not all gobans have size
        },
        stateEditable: function() {
            stateEditable = true;
        },
        stateEdit: callbacks.callback('stateEdit'),
        setTurn: function(nextTurn) {
            turn = nextTurn;
        },
        disable: function() {
            enabled = false;
            stateEditable = false;
        },
        enable: function() {
            enabled = true;
        },
        placed: callbacks.callback('placed'),
        removeCallback: callbacks.removeCallback,
        clear: clear,
        focus: function(point) {
            console.log("todo: implement focus");
        },
        defocus: function(point) {
            console.log("todo: implement defocus");
        },
        defocusAllPoints: function() {
            if(lastFocusedPoint) {
                lastFocusedElement.remove();
                lastFocusedElement = null;
                lastFocusedPoint = null;
            }
            for(var k in points) {
                if(points[k].overlay) {
                    points[k].overlay.element.remove();
                    delete points[k].overlay;
                }
            }
        },
        defocusPoint: function(pointIndex) {
            if(lastFocusedPoint) {
                lastFocusedElement.remove();
                lastFocusedElement = null;
                lastFocusedPoint = null;
            }
            var point = points[pointIndex];
            if(point.overlay) {
                point.overlay.element.remove();
                delete point.overlay;
            }
        },
        setPointOverlay: setPointOverlay,
        resetToSize: function(toSize) {
            // todo: support other sizes other than 9
        },
        place: place,
        hide: function() {
            element.hide();
            hideGhostElements();
        },
        fit: fit,
        show: function() {
            element.show();
            fit();
        },
        remove: function() {
            element.remove();
            element = null;
        },

        pointToCoord: pointToCoord
    };
};
