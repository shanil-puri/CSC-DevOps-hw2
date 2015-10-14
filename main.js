var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases(filePath)

}

var engine = Random.engines.mt19937().autoSeed();

function createConcreteIntegerValue( greaterThan, constraintValue )
{
	if( greaterThan )
		return Random.integer(constraintValue,constraintValue+10)(engine);
	else
		return Random.integer(constraintValue-10,constraintValue)(engine);
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	// Supported kinds: "fileWithContent","fileExists"
	// integer, string, phoneNumber
	this.kind = properties.kind;
}

function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
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
  			file1: 'text content',
		}
	}
};

function paraObject() {
return {'params': ''}
}

function permuteConst(constrained, paramId, length, newparams, tcs)
{
	if (paramId >= length)
	{
		var a = JSON.parse(JSON.stringify(newparams));;
		tcs.push(a);
		return;	
	}
	if (constrained[paramId].length == 0)
	{	
		newparams[paramId] = '';
		permuteConst(constrained, paramId + 1, length, newparams, tcs);
	}
	
	for (var i=0; i < constrained[paramId].length; i++)
	{
		newparams[paramId] = constrained[paramId][i];
		permuteConst(constrained, paramId+1, length, newparams, tcs);
	}
}

function generateTestCases(filePath)
{

	var content = "var subject = require('./" + filePath +"')\nvar mock = require('mock-fs');\nvar rand_val='0'\n";
	for ( var funcName in functionConstraints )
	{
               //console.log(funcName);
		
		var params = {};
		var constrained = [];
		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			params[paramName] = '\'\'';
			constrained[i] = [];
		}
		//console.log( params );

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {kind: 'fileWithContent' });
		var pathExists      = _.some(constraints, {kind: 'fileExists' });
		var dirExist = true;
		var fileWithoutContent = true;
		// plug-in values for parameters
		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];

			if( params.hasOwnProperty( constraint.ident ) )
			{
				var paraId = 0;
				for (var i =0; i< functionConstraints[funcName].params.length; i++ )
				{
					if(constraint.ident == functionConstraints[funcName].params[i])
					{
						paraId = i;
						break;
					}
				}
				constrained[paraId].push(constraint);
			}
		}

		var temp_c = [];
		var all_c = [];
		permuteConst(constrained, 0, functionConstraints[funcName].params.length, temp_c, all_c);

		for (var tc=0 ; tc < all_c.length; tc++)
		{
			for(var p =0; p < all_c[tc].length; p++)
			{
				var constraint = all_c[tc][p];
				if(constraint == '')
				{
				   var parName = functionConstraints[funcName].params[p];
				   params[parName] = '\'\'';
				}
				else
				{
				   if(constraint.kind == 'phoneNumber')
				   {
					if(constraint.operator == 'substring')
					{
						params[constraint.ident] = '\'' +constraint.value+'9855489\'';
					}
					else
					{
					 	params[constraint.ident] = '\'' + faker.phone.phoneNumber()+'\'';
					}
				   }
				   else
				   { 
				       params[constraint.ident] = constraint.value;
				   }
				}
			}

			var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");

			if( 0 && (pathExists || fileWithContent))
			{
				content += generateMockFsTestCases(pathExists,!fileExist, fileWithContent,funcName, args);
				content += generateMockFsTestCases(pathExists, fileExist, fileWithContent, funcName, args);
				content += generateMockFsTestCases(!pathExists,!fileExist, fileWithContent,funcName, args);
				content += generateMockFsTestCases(pathExists,!fileExist, !fileWithContent,funcName, args);
				content += generateMockFsTestCases(!pathExists,!fileExist, !fileWithContent,funcName, args);
			}
			else
			{
			// Emit simple test case.
				content += "subject.{0}({1});\n".format(funcName, args );
			}
		}		
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
		if( pathExists || fileWithContent )
		{
			content += generateMockFsTestCases(pathExists, dirExist, fileWithContent, fileWithoutContent, funcName, args);
			// Bonus...generate constraint variations test cases
			content += generateMockFsTestCases(pathExists, dirExist, fileWithContent, !fileWithoutContent, funcName, args);
			content += generateMockFsTestCases(pathExists, !dirExist, fileWithContent, fileWithoutContent, funcName, args);
			content += generateMockFsTestCases(!pathExists, !dirExist, fileWithContent, !fileWithoutContent, funcName, args);
			content += generateMockFsTestCases(pathExists, dirExist, !fileWithContent, false, funcName, args);
			content += generateMockFsTestCases(!pathExists, !dirExist, !fileWithContent,false, funcName, args);
		}
		else
		{
			// Emit simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}
	}


	fs.writeFileSync('test.js', content, "utf8");

}

function generateMockFsTestCases (pathExists, fileExists, fileWithContent, fileWithoutContent, funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
		if(fileExists)
		{
			mergedFS[attrname] = {"dir1":"testdir"};
		}
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
		if(fileWithoutContent)
		{
			mergedFS[attrname] = {'file1':''};
		}
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

			if(params.indexOf("phoneNumber") >-1)
			{
			// add phone number constraint
				functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: "phoneNumber",
						value: '',
						funcName: funcName,
						kind: 'phoneNumber',
						operator : '',
						expression: ''
					}));
			}

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				if( child.type == 'UnaryExpression' && child.operator == "!")
				{
					if(child.argument.type == 'Identifier' && params.indexOf(child.argument.name)>-1)
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.argument.name,
								value: true,
								funcName: funcName,
								kind: 'boolean',
								operator : child.operator,
								expression: expression
							}));

					}
					if(child.argument.type == 'MemberExpression' && child.argument.object.type == 'Identifier' && params.indexOf(child.argument.object.name)>-1
						&& child.argument.property)
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						var childName = child.argument.property.name;

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.argument.object.name,
								value: JSON.stringify({childName: true}),
								funcName: funcName,
								kind: 'string',
								operator : child.operator,
								expression: expression
							}));
					}
				}

				if( child.type === "BinaryExpression" && ( child.operator == "==" || child.operator == "<" || child.operator == ">" ) 
					&& (child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1) )
				{
					// get expression from original source code:
					var expression = buf.substring(child.range[0], child.range[1]);
					var rightHand = buf.substring(child.right.range[0], child.right.range[1])
					var childType = typeof(child.right.value);
					
					var rightHand_r;
					var rightHand_l;
					
					if (childType == 'number')
					{
						rightHand_r = parseInt(rightHand)+1;
						rightHand_l = parseInt(rightHand)-1;
					}
					else
					{
						rightHand_r = "rand_val";
						rightHand_l = "rand_val";
					}

					functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand,
							funcName: funcName,
							kind: childType,
							operator : child.operator,
							expression: expression
						}));
					if(childType == 'number')
					{
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: rightHand_r,
								funcName: funcName,
								kind: childType,
								operator : child.operator,
								expression: expression
							}));
					}
					functionConstraints[funcName].constraints.push( 
						new Constraint(
						{
							ident: child.left.name,
							value: rightHand_l,
							funcName: funcName,
							kind: childType,
							operator : child.operator,
							expression: expression
						}));
				}

				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])

						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: rightHand,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}));
					}
					if(child.left.type == 'Identifier' && params.indexOf(child.left.name) <= 0 && params.indexOf("phoneNumber") > -1)
					{
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: 'phoneNumber',
								value: child.right.value,
								funcName: funcName,
								kind: 'phoneNumber',
								operator : 'substring',
								expression:''
							}));
					}
				}

				if( child.type === 'BinaryExpression' && child.operator == "<")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						// get expression from original source code:
						var expression = buf.substring(child.range[0], child.range[1]);
						var rightHand = buf.substring(child.right.range[0], child.right.range[1])
						// var rightHand = Math.floor(Math.random() * (0 - (-1))) - 1);
						
						functionConstraints[funcName].constraints.push( 
							new Constraint(
							{
								ident: child.left.name,
								value: rightHand,
								funcName: funcName,
								kind: "integer",
								operator : child.operator,
								expression: expression
							}));
					}

					

					if(child.left.type == "CallExpression" && child.left.callee.type == "MemberExpression"
						&& child.left.callee.object.type == "Identifier")
					{
						var expression = buf.substring(child.range[0], child.range[1]);
						var cType = 'string';
						var rightHand = buf.substring(child.left.arguments[0].range[0],child.left.arguments[0].range[1]);
						
						functionConstraints[funcName].constraints.push(
	                        new Constraint(
	                        {
	                                ident: child.left.callee.object.name,
	                                value: rightHand,
	                                funcName: funcName,
	                                kind: cType,
	                                operator : child.operator,
	                                expression: expression
	                        }));
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
							new Constraint(
							{
								ident: params[p],
								value:  "'pathContent/file1'",
								funcName: funcName,
								kind: "fileWithContent",
								operator : child.operator,
								expression: expression
							}));
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
							new Constraint(
							{
								ident: params[p],
								value:  "'path/fileExists'",
								funcName: funcName,
								kind: "fileExists",
								operator : child.operator,
								expression: expression
							}));
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