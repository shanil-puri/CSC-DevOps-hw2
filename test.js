var subject = require('./subject.js')
var mock = require('mock-fs');
var blah = Math.floor(Math.random() * (0 - (-1)) - 1);
subject.inc(blah,undefined);

subject.weird('','','',"strict");

mock(
		{
			"path/fileExists":{},
			"pathContent":{"file1":"text content"}
		}
	);
	subject.fileTest('path/fileExists','pathContent/file1');

mock.restore();
subject.normalize('');
subject.format('','','');
subject.blackListNumber('');
