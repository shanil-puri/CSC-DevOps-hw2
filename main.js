var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var random =  new Random(Random.engines.mt19937().seed(0));
function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()

}


function fakeDemo(areaCode)
{
	var fakePhoneNumber, generatedAreaCode;
	//areaCode=areaCode.substring(1,4);
	while(1)
	{
		fakePhoneNumber = faker.phone.phoneNumberFormat();
		generatedAreaCode = '"'+fakePhoneNumber.substring(0,3)+'"';
		if (generatedAreaCode==areaCode)
		{
			return fakePhoneNumber;
		}
	}
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content'
		}
	}
};

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\n";
	for ( var funcName in functionConstraints )
	{
		//console.log("----------"+functionConstraints["blackListNumber"].params.length);
		var params = {};
		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{

			var paramName = functionConstraints[funcName].params[i];
			//params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = '\'\'';
		}
		//console.log(params["phoneNumber"]);
		//console.log( params );

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {mocking: 'fileWithContent' });
		var fileWithoutContent = _.some(constraints, {mocking: '' });
		var pathExists      = _.some(constraints, {mocking: 'fileExists' });
		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident] = constraint.value;
				if (!(pathExists|| fileWithContent))
				{
					var arg = Object.keys(params).map( function(k) {return params[k]; }).join(",");
					content += "subject.{0}({1});\n".format(funcName, arg );
					params[constraint.ident]='\'\'';
					if(params.hasOwnProperty(constraint.inverse))
						params[constraint.ident] = constraint.inverse;
				}
			}
		}

		// Prepare function arguments.
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");

		if( pathExists || fileWithContent )
		{
			content += generateMockFsTestCases(pathExists,fileWithContent,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(!pathExists,!fileWithContent,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,funcName, args);
			content += generateMockFsTestCases(pathExists,fileWithoutContent,funcName, args);
		}
		else
		{
			// Emit simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}

	}


	fs.writeFileSync('test.js', content, "utf8");

}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Insert mock data based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});
			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{

				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						functionConstraints[funcName].constraints.push(
							{
								ident: child.left.name,
								value: rightHand,
								inverse: !rightHand
							}
						);
					}
					else {
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						//console.log(rightHand);
						var areaCode = "'"+fakeDemo(rightHand)+"'";
						functionConstraints[funcName].constraints.push(
							{
								ident: params[0],
								value: areaCode
							}
						);
					}


				}

				if( child.type === 'BinaryExpression' && child.operator == "<")
				{
					if (child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						var inverse = random.integer(rightHand-20,rightHand-1);
						functionConstraints[funcName].constraints.push(
							{
								ident: child.left.name,
								value: inverse
							});
					}

				}

					if( child.type === 'LogicalExpression' && child.operator == "||")
				{
					if( child.left.type == 'UnaryExpression')
					{
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						var n = "normalize";
						if (rightHand.indexOf(n)>-1)
						{
							console.log(params[2]);
							functionConstraints[funcName].constraints.push(
								{
									ident: params[2],
									value: "{"+n+":true}"
								});
						}

					}
				}

				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'pathContent/file1'",
								mocking: 'fileWithContent'
							});
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'path/fileExists'",
								mocking: 'fileExists'
							});
						}
					}
				}

			});

			console.log( functionConstraints[funcName]);

		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();