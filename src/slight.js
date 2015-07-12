(function(window, document, location){
    var base = "/";
    window.onload = function(){
        $slight.run();
        var baseObj = document.querySelector("base") || {href: "/"};
        var a = document.createElement("a");
        a.href = baseObj.href + "/";
        base = a.pathname.replace("//", "/");
    };

    $global = {
        data: []
    };

    /**
     * Core functionality
     */
    $slight = {
        config: {
            maxLoadLoops: 5,
            cacheTemplates: true
        },
        templates: {},
        defaultRoute: null,
        template: null,
        hasRouting: false,
        data: [],
        /**
         * Executes the page
         * @returns {$slight}
         */
        run: function(){
            var cfg = document.querySelector("meta[data-name=config]");
            var $this = this;
            $ajax.json(cfg.content).success(function(json){
                $this.config = $this.mergeOptions($this.config, json);
                $this.getRoute();
                $this.loadAdditionalData().then(function(){
                    $templating.parsePage();
                });
            });
            return this;
        },
        /**
         * Recursively merge two Objects into one Object
         * Based on: http://stackoverflow.com/a/171256/1778465
         * @param {Object} obj1
         * @param {Object} obj2
         * @returns {Object}
         */
        mergeOptions: function(obj1, obj2){
            var obj3 = (!obj1 && Array.isArray(obj2)) ? [] : {};
            for(var attrname in obj1){
                obj3[attrname] = obj1[attrname];
            }
            for(var attrname in obj2){
                if(Array.isArray(obj2[attrname]) || typeof obj2[attrname] === "object"){
                    obj3[attrname] = this.mergeOptions(obj3[attrname], obj2[attrname]);
                }else{
                    obj3[attrname] = obj2[attrname];
                }
            }
            return obj3;
        },
        /**
         * Gets the route of the current page
         * @returns {$slight}
         */
        getRoute: function(){
            var path = location.pathname;
            if(this.config && this.config.routes){
                this.hasRouting = true;
                var $this = this;
                this.config.routes.forEach(function(item){
                    var cfgRoute = item.route;
                    if(item.default && item.template){
                        $this.defaultRoute = item.template;
                    }
                    if(path === cfgRoute && item.template){
                        var template = item.template;
                        if(template in $this.templates){
                            $this.template = template;
                            $this.displayTemplate();
                        }else{
                            $this.loadTemplate(template);
                        }
                    }
                });
                if(!this.template && this.defaultRoute){
                    this.loadTemplate(this.defaultRoute);
                }
            }
            return this;
        },
        /**
         * Loads a template using AJAX
         * @param {String} templateUrl
         * @returns {$slight}
         */
        loadTemplate: function(templateUrl){
            var $this = this;
            $ajax.get(templateUrl).success(function(data){
                $this.template = data;
                $this.templates[templateUrl] = data;
                $this.displayTemplate();
            });
            return this;
        },
        /**
         * Displays the template
         * @returns {$slight}
         */
        displayTemplate: function(){
            var view = document.querySelector("[data-app] [data-view]");
            if(view){
                view.innerHTML = this.template;
                var links = document.querySelectorAll("[data-app] [data-view] a");
                var $this = this;
                [].forEach.call(links, function(item){
                    item.onclick = function(e){
                        e.preventDefault();
                        var path = $path(e.target.href);
                        window.history.pushState({}, "", (base + path.pathname).replace("//", "/"));
                        $this.getRoute();
                    };
                });
            }
            return this;
        },
        /**
         * Loads additional data from the html
         * @returns {$slight}
         */
        loadAdditionalData: function(){
            var jsonData = document.querySelectorAll("[data-load-json]:not([data-loaded])");
            var $this = this;
            var requests = [];
            [].forEach.call(jsonData, function(item){
                // Get link from content or data-content whichever is available
                var link = item.content || item.dataset.content || false;
                if(!link){
                    return true;
                }
                var req = $ajax.json({url: link, meta: {varName: item.dataset.loadJson}});
                item.setAttribute("data-loaded", "true");
                requests.push(req);
            });
            return new Promise(function(resolve, reject){
                $async(requests).complete(function(data){
                    data.forEach(function(item){
                        $global.data.push({
                            name: item.meta.varName,
                            data: item.data
                        });
                    });
                    resolve();
                });
            });
        }
    };

    $templating = {
        parsePage: function(rootNode){
            if(typeof rootNode === 'undefined'){
                rootNode = document;
            }
            var repeaters = rootNode.querySelectorAll("[data-repeat]:not([data-repeated])");

            if(repeaters.length === 0){
                return;
            }

            var $this = this;
            [].forEach.call(repeaters, function(item){
                var repeat = item.getAttribute("data-repeat").split(/\s+in\s+/);
                var filter = item.getAttribute("data-filter") || "";
                item.setAttribute("data-repeated", "true");
                var parent = item.parentNode;

                // Find the data associated to the repeater where the names are the same
                var result = $global.data.filter(function(itm){
                    return itm.name === repeat[1];
                });

                // Get the data and apply a filter if one is present
                var data = result[0].data;
                var items = $filter(filter, repeat[1], repeat[0]).apply(data);

                // Get the html as a stirng so we can replace the placeholders
                var cloneRoot = document.createElement("div");
                var clone = item.cloneNode(true);
                cloneRoot.appendChild(clone);

                parent.removeChild(item);
                // Replace the items in the string with the ones from the array
                items.forEach(function(dtaitem){
                    $this.parsePage(cloneRoot);
                    var cloneStr = cloneRoot.innerHTML;
                    var regex = new RegExp('\\{\\$' + repeat[0] + '\\.(.+?)\\}', 'g');
                    cloneStr.match(regex).forEach(function(item){
                        var itemStr = item.replace(new RegExp('\\{\\$' + repeat[0] + '\\.'), "").replace(/\}$/, "");
                        var value = dtaitem.find(itemStr);
                        cloneStr = cloneStr.replace("{$" + repeat[0] + "." + itemStr + "}", value);
                    });
                    var node = document.createElement("div");
                    node.innerHTML = cloneStr;
                    parent.appendChild(node.childNodes[0]);
                });
            });
        }
    };
})(window, document, location);

$filter = function(filter, objectName, shortHand){
    var filterCore = {
        filter: filter,
        objectName: objectName,
        shortHand: shortHand,
        apply: function(data){
            var $this = this;
            generateMarkup = function(){
                var expString = $this.filter;
                if(typeof $this.shortHand !== 'undefined'){
                    var reg = new RegExp('(^|\\s)' + $this.shortHand + '\\.', 'g');
                    expString = expString.replace(reg, '$1data.' + $this.objectName + '.');
                }
                console.log(expString)
                var result = data.filter(function(item){

                });
                return result;
            };

            if(!this.filter){
                return data;
            }else{
                generateMarkup();
                return data;
            }
//            return data;
//    var result = [].filter(function(item){
//        return item.thing === '123';
//    });
        }
    };

    return filterCore;
};

$path = function(path){
    var l = document.createElement("a");
    l.href = path;
    return {
        scheme: l.scheme,
        host: l.host,
        pathname: l.pathname,
        query: l.query,
        hash: l.hash
    };
};

/**
 * Allows for ajax functionality
 */
$ajax = {
    successCallback: null,
    failCallback: null,
    promise: null,
    /**
     * Gets a file and returns the data as json
     * @param {Mixed} options URL String or options object
     * @returns {$ajax}
     */
    json: function(options){
        var ajx = Object.create($ajax);
        if(options.meta){
            ajx.meta = options.meta;
        }
        ajx.request(options).then(function(data){
            if(ajx.successCallback){
                ajx.successCallback(JSON.parse(data));
            }
        }, function(){
            if(ajx.failCallback){
                ajx.failCallback();
            }
        });
        return ajx;
    },
    /**
     * Gets a file and returns the data as is
     * @param {Mixed} options URL String or options object
     * @returns {$ajax}
     */
    get: function(options){
        var ajx = Object.create($ajax);
        if(options.meta){
            ajx.meta = options.meta;
        }
        ajx.request(options).then(function(data){
            if(ajx.successCallback){
                ajx.successCallback(data);
            }
        }, function(){
            if(ajx.failCallback){
                ajx.failCallback();
            }
        });
        return ajx;
    },
    /**
     * Handles the actual ajax request
     * @param {String} options
     * @returns {$ajax}
     */
    request: function(options){
        this.promise = new Promise(function(resolve, reject){
            var xmlhttp;
            var url = typeof options === "string" ? options : options.url;
            if(window.XMLHttpRequest){// code for IE7+, Firefox, Chrome, Opera, Safari
                xmlhttp = new XMLHttpRequest();
            }else{// code for IE6, IE5
                xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
            }
            xmlhttp.onreadystatechange = function(){
                if(xmlhttp.readyState === 4 && xmlhttp.status === 200){
                    resolve(xmlhttp.responseText);
                }else if(xmlhttp.readyState === 4 && xmlhttp.status !== 200){
                    reject();
                }
            };
            var base = document.querySelector("base") || {href: "/"};
            xmlhttp.open("GET", base.href + ("/" + url).replace("//", "/"));
            xmlhttp.send();
        });
        return this.promise;
    },
    success: function(callback){
        this.successCallback = callback;
        return this;
    },
    fail: function(callback){
        this.failCallback = callback;
        return this;
    },
    complete: function(requests, callback){

    }
};

$async = function(requests){
    var obj = {
        count: requests.length,
        data: [],
        meta: {},
        completeCallback: null,
        complete: function(callback){
            this.completeCallback = callback;
            return this;
        }
    };

    requests.forEach(function(item){
        if(!item.promise){
            return false;
        }
        item.promise.then(function(data){
            obj.count--;
            var dta = {
                data: JSON.parse(data) || data,
                meta: item.meta
            };
            obj.data.push(dta);

            if(obj.count <= 0){
                obj.completeCallback(obj.data, obj.meta);
            }
        });
    });

    return obj;
};

/*
 * Object prototypes
 */

/**
 * Finds an item in an object using a string:
 *      foo.bar[4].color
 *      foo.bar.item
 * @param {String} path
 * @returns {Object|String}
 */
Object.prototype.find = function(path){
    var obj = this;
    for(var i = 0, path = path.split(/[\[\]\.]/), len = path.length; i < len; i++){
        if(path[i]){
            obj = obj[path[i]];
            if(typeof obj === 'undefined'){
                return '';
            }
        }
    }
    return obj;
};

/**
 * Queries an object for matching items
 * @param {type} query
 * @returns {undefined}
 */
Object.prototype.query = function(query){

};

//Object.defineProperty(Array.prototype, "push", {
//    configurable: true,
//    enumerable: true, // hide from for...in
//    writable: true,
//    value: function(){
//        for(var i = 0, n = this.length, l = arguments.length; i < l; i++, n++){
//            //RaiseMyEvent(this, n, this[n] = arguments[i]); // assign/raise your event
//        }
//        return n;
//    }
//});