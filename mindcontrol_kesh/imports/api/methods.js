import {Subjects} from "./module_tables.js"

Meteor.methods({

    getDateHist: function(){
            //console.log("running the aggregate")
            if (Meteor.isServer){
                var foo = Subjects.aggregate([{$match: {entry_type: "demographic"}},{$group:{_id:"$metrics.DCM_StudyDate", count:{$sum:1}}}])
                //console.log(foo)
                return foo
            }


      },

    getHistogramData: function(entry_type, metric, filter){
          
          if (Meteor.isServer){
          
          var no_null = filter
          no_null["entry_type"] = entry_type
          var metric_name = "metrics."+metric
          
          if (Object.keys(no_null).indexOf(metric_name) >=0 ){
              no_null[metric_name]["$ne"] = null
          }
          else{
              no_null[metric_name] = {$ne: null}
          }

          console.log("NONULL", no_null)
          var metric_element = Subjects.find(no_null, {sort: [[metric_name, "descending"]], limit: 1}).fetch()[0]["metrics"][metric]

          //console.log("DATATYPE: " , typeof metric_element)
          if(typeof metric_element == "number"){

            var minval = Subjects.find(no_null, {sort: [[metric_name, "ascending"]], limit: 1}).fetch()[0]["metrics"][metric]
            var maxval = Subjects.find(no_null, {sort: [[metric_name, "descending"]], limit: 1}).fetch()[0]["metrics"][metric]
            var bins = 20
            var bin_size = (maxval-minval)/(bins+1)
            console.log("the bin size is", bin_size)

            if (bin_size){
                  var foo = Subjects.aggregate([{$match: no_null},
                      {$project: {lowerBound: {$subtract: ["$metrics."+metric,
                          {$mod: ["$metrics."+metric, bin_size]}]}}},
                      {$group: {_id: "$lowerBound", count: {$sum: 1}}}])
                  var output = {}

                  output["histogram"] = _.sortBy(foo, "_id")
                  if (minval < 0){
                    output["minval"] = minval*1.05
                  } else {
                    output["minval"] = minval*0.95
                  }

                  output["maxval"] = maxval*1.05
                  output["bins"] = bins
                  console.log(output)
                  return output
            }
            else{
                  var output= {}
                  output["histogram"] = []
                  output["minval"] = 0
                  output["maxval"] = 0
                  return output
            }

        }
        else if(typeof metric_element == "string" && metric_element.includes("1970-01-01T", 0)){

          var foo = Subjects.aggregate([{$match: no_null},
              { $project: 
                { bin: 
                   { "$substr": ["$metrics."+metric, 11, 2] },
                }
              },
              {$group: { _id: "$bin", count: {$sum: 1} } } ])

          // var data = Subjects.aggregate([{$match: no_null},
          //     { $project: 
          //       { bin: 
          //          { $dateFromString: {dateString: '$metrics.'+metric}}
          //       } 
          //     },
          //     {$group: { _id: "$bin", count: {$sum: 1} } } ])
          var output = {}
  
          output["histogram"] = _.sortBy(foo, "_id")

          for(var i=0; i<output["histogram"].length; i++){
            output["histogram"][i]["label"] = output["histogram"][i]["_id"];
            output["histogram"][i]["_id"] = Number(output["histogram"][i]["_id"]);
          }

          output["minval"] = -0.5
          output["maxval"] = 24
          output["bins"] = 24
          console.log(output)
          return output
            

        }

        else if(typeof metric_element == "string"){

          var distinct_metric_values = Subjects.distinct(metric_name)
          

          var foo = Subjects.aggregate([
            {$match: no_null},
            {$project: 
              {bin: "$metrics."+metric}
            },
            {$group: {_id: "$bin", count: {$sum: 1}}}])

          var output = {}
          output["histogram"] = _.sortBy(foo, "_id")

          for(var i=0; i<output["histogram"].length; i++){
            output["histogram"][i]["label"] = output["histogram"][i]["_id"];
            output["histogram"][i]["_id"] = i+1;
          }

          output["minval"] = output["histogram"][0]["_id"]*((distinct_metric_values.length-1)/distinct_metric_values.length)
          output["maxval"] = output["histogram"][output["histogram"].length-1]["_id"]*((distinct_metric_values.length+1)/distinct_metric_values.length)
          output["bins"] = distinct_metric_values.length
          console.log(output)
          return output
        }
        }
      },

    get_subject_ids_from_filter: function(filter){
        if (Meteor.isServer){
            var subids = []
            var cursor = Subjects.find(filter,{subject_id:1, _id:0})
            //console.log("the filter in this method is", filter, cursor.count())
            var foo = cursor.forEach(function(val){subids.push(val.subject_id)})
            //console.log("the number subjects to filter by are",filter, subids.length)
            return subids
        }

    },

    updateQC: function(qc, form_data){
        console.log(form_data)
        Subjects.update({entry_type: qc.entry_type, name:qc.name}, {$set: form_data})
    },

    get_metric_names: function(entry_type){

        if (Meteor.isServer){
            var settings = _.find(Meteor.settings.public.modules, function(x){return x.entry_type == entry_type})


            if (settings.metric_names){
              return settings.metric_names     
            }
            no_null= {metrics: {$ne: {}}, "entry_type": entry_type}
            var dude = Subjects.findOne(no_null)
            if (dude){
                return Object.keys(dude["metrics"])
            }
            //console.log("DUDE IS", dude)

        }

    },
    get_metric_labels: function(entry_type){

        if (Meteor.isServer){
            var settings = _.find(Meteor.settings.public.modules, function(x){return x.entry_type == entry_type})
            metriclabels_json = Meteor.settings.public.metric_labels

            mylabels = JSON.parse(HTTP.get(metriclabels_json).content)
            var labels_dict = {}

            for (var key in mylabels){
              if(mylabels.hasOwnProperty(key)){
                var value = mylabels[key]
                labels_dict[key] = value
              }
            }
            //console.log("labels_dict", labels_dict)


            var temp = []
            if (settings.metric_names){
              
              for(var i=0; i<settings.metric_names.length; i++)
                temp.push(settings.metric_names[i]+"- "+labels_dict[settings.metric_names[i]])
              return temp
              //return settings.metric_names     
            }


            no_null= {metrics: {$ne: {}}, "entry_type": entry_type}
            var dude= Subjects.findOne(no_null)

            if (dude){
                var keys = Object.keys(dude["metrics"])

                for(var i=0; i<keys.length; i++)
                  temp.push(keys[i]+"- "+labels_dict[keys[i]]) 
                return temp
            }
            //console.log("DUDE IS", dude)

        }

    },
    add_assessment_subjects: function(entry_type){
      if (Meteor.isServer){
          var fs=require('fs');
          var file='/Users/md35727/spyder_workspace/'+entry_type+'.json'
          var data=fs.readFileSync(file, 'utf8');
          var myobject=JSON.parse(data);

          myobject.forEach(function(val,idx,array){
                  console.log(val.subject_id)
                  Subjects.insert(val)
          })
      }
    },
    save_query: function(name, gSelector){
        var topush = {"name": name, "selector": gSelector}
        Meteor.users.update(this.userId, {$push: {queries: topush}})
    },

    removeQuery: function(query, name){

        console.log("query is", query, name)
        var topull = {"name": name, "selector": query}
        Meteor.users.update(this.userId, {$pull: {queries: topull}})

    },

    get_generator: function(entry_type){
        if (Meteor.isServer){
        var myjson = {};
        myjson = JSON.parse(Assets.getText("generator.json"));
        if (entry_type == null){
            return myjson
        }
        else{
        console.log("entry_Type", entry_type)
        //console.log("myjson", myjson.modules)
        var output =  myjson.modules.find(function(o){return o.entry_type == entry_type})
        console.log("output is", output)
        return output
        }}
    },

    launch_clouder: function(command){
      if (Meteor.isServer){
          var sys = Npm.require('sys')
          var exec = Npm.require('child_process').exec;
          function puts(error, stdout, stderr) {
               sys.puts(stdout)
               console.log("done")
           }
          exec(command, puts);
      }
    }

  });
